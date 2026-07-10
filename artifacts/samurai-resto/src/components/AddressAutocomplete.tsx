import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import type { StructuredAddress } from "@/lib/checkoutStorage";
import { useTenant } from "@/lib/tenant";

type PlacesConfig = {
  googleMapsApiKey: string | null;
  places: {
    country: string;
    locationBias: { lat: number; lng: number; radiusMeters: number };
  };
};

type GooglePlaceResult = {
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
  geometry?: { location: { lat: () => number; lng: () => number } };
};

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  const g = (window as { google?: { maps?: { places?: unknown } } }).google;
  if (g?.maps?.places) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.getElementById("google-maps-places");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "google-maps-places";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
}

function parseAddressComponents(
  place: GooglePlaceResult,
): StructuredAddress | null {
  const components = place.address_components ?? [];
  const get = (type: string, short = false) => {
    const c = components.find((x) => x.types.includes(type));
    return short ? c?.short_name : c?.long_name;
  };

  const streetNumber = get("street_number") ?? "";
  const route = get("route") ?? "";
  const street = [streetNumber, route].filter(Boolean).join(" ").trim();
  const city =
    get("locality") ??
    get("sublocality") ??
    get("administrative_area_level_2") ??
    "";
  const state = get("administrative_area_level_1", true) ?? "";
  const postcode = get("postal_code") ?? "";
  const lat = place.geometry?.location.lat();
  const lng = place.geometry?.location.lng();

  if (!street || !city || !state || !postcode || lat == null || lng == null) {
    return null;
  }

  return { street, unit: null, city, state, postcode, lat, lng };
}

interface AddressAutocompleteProps {
  apiBase: string;
  value: StructuredAddress | null;
  unit: string;
  onAddressChange: (address: StructuredAddress | null) => void;
  onUnitChange: (unit: string) => void;
  disabled?: boolean;
}

export function AddressAutocomplete({
  apiBase,
  value,
  unit,
  onAddressChange,
  onUnitChange,
  disabled,
}: AddressAutocompleteProps) {
  const { tenant } = useTenant();
  const areaLabel =
    tenant?.restaurant?.city ||
    tenant?.name ||
    "our delivery";
  const inputRef = useRef<HTMLInputElement>(null);
  const [streetInput, setStreetInput] = useState(value?.street ?? "");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (value?.street) setStreetInput(value.street);
  }, [value?.street]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/config/checkout`);
        const config = (await res.json()) as PlacesConfig;
        if (!config.googleMapsApiKey) {
          setError("Address autocomplete is not configured.");
          return;
        }
        await loadGoogleMapsScript(config.googleMapsApiKey);
        if (cancelled || !inputRef.current) return;

        const gmaps = (window as {
          google: {
            maps: {
              places: {
                Autocomplete: new (
                  input: HTMLInputElement,
                  opts?: Record<string, unknown>,
                ) => {
                  addListener: (event: string, handler: () => void) => void;
                  getPlace: () => GooglePlaceResult;
                };
              };
              LatLng: new (lat: number, lng: number) => unknown;
            };
          };
        }).google;

        const bias = config.places.locationBias;
        const autocomplete = new gmaps.maps.places.Autocomplete(
          inputRef.current,
          {
            componentRestrictions: { country: config.places.country },
            fields: ["address_components", "geometry"],
            types: ["address"],
            location: new gmaps.maps.LatLng(bias.lat, bias.lng),
            radius: bias.radiusMeters,
          },
        );

        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const parsed = parseAddressComponents(place);
          if (!parsed) {
            setError("Please select a complete street address from the list.");
            onAddressChange(null);
            return;
          }
          setError(null);
          setStreetInput(parsed.street);
          onAddressChange({ ...parsed, unit: unit.trim() || null });
        });

        setReady(true);
      } catch {
        if (!cancelled) setError("Could not load address search.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBase, onAddressChange, unit]);

  return (
    <div className="space-y-3">
      <div>
        <Input
          ref={inputRef}
          value={streetInput}
          onChange={(e) => {
            setStreetInput(e.target.value);
            if (!e.target.value.trim()) onAddressChange(null);
          }}
          placeholder="Start typing your street address…"
          className="h-12 bg-background"
          disabled={disabled || !ready}
          autoComplete="off"
        />
        {value && (
          <p className="text-xs text-muted-foreground mt-1.5">
            {value.city}, {value.state} {value.postcode}
          </p>
        )}
      </div>
      <Input
        value={unit}
        onChange={(e) => {
          onUnitChange(e.target.value);
          if (value) {
            onAddressChange({ ...value, unit: e.target.value.trim() || null });
          }
        }}
        placeholder="Apt / Suite / Unit (optional)"
        className="h-11 bg-background"
        disabled={disabled}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!value && !error && (
        <p className="text-xs text-muted-foreground">
          Select your address from the suggestions — we deliver within the {areaLabel} area.
        </p>
      )}
    </div>
  );
}
