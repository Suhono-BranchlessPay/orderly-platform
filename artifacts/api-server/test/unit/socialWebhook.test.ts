import { parseMetaWebhookBody } from "../../src/lib/socialWebhook";

describe("parseMetaWebhookBody", () => {
  test("keeps Page feed comments", () => {
    const parsed = parseMetaWebhookBody({
      object: "page",
      entry: [
        {
          id: "PAGE1",
          changes: [
            {
              field: "feed",
              value: {
                item: "comment",
                verb: "add",
                comment_id: "c1",
                post_id: "PAGE1_p1",
                message: "Looks delicious!",
                from: { id: "u1", name: "Pat" },
              },
            },
          ],
        },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.kind).toBe("comment");
    expect(parsed[0]!.externalMessageId).toBe("c1");
  });

  test("files mention-field tags as mention", () => {
    const parsed = parseMetaWebhookBody({
      object: "page",
      entry: [
        {
          id: "PAGE1",
          changes: [
            {
              field: "mention",
              value: {
                item: "mention",
                verb: "add",
                post_id: "USER_POST_99",
                message: "Overall, highly recommend! Full table ~$80",
                from: { id: "u9", name: "AndrewBrittany Cole" },
                created_time: "2026-07-19T00:27:06+0000",
              },
            },
          ],
        },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.kind).toBe("mention");
    expect(parsed[0]!.externalMessageId).toBe("USER_POST_99");
    expect(parsed[0]!.body).toMatch(/highly recommend/i);
  });

  test("files visitor timeline posts (not Page's own publish)", () => {
    const parsed = parseMetaWebhookBody({
      object: "page",
      entry: [
        {
          id: "PAGE1",
          changes: [
            {
              field: "feed",
              value: {
                item: "status",
                verb: "add",
                post_id: "VISITOR_12",
                message: "Tried Samurai tonight — so good",
                from: { id: "visitor1", name: "Guest" },
              },
            },
            {
              field: "feed",
              value: {
                item: "status",
                verb: "add",
                post_id: "PAGE1_own",
                message: "Our lunch special",
                from: { id: "PAGE1", name: "Samurai" },
              },
            },
          ],
        },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.kind).toBe("mention");
    expect(parsed[0]!.externalMessageId).toBe("VISITOR_12");
  });

  test("skips reactions / likes", () => {
    const parsed = parseMetaWebhookBody({
      object: "page",
      entry: [
        {
          id: "PAGE1",
          changes: [
            {
              field: "feed",
              value: {
                item: "reaction",
                verb: "add",
                post_id: "PAGE1_p1",
                from: { id: "u1", name: "Pat" },
              },
            },
          ],
        },
      ],
    });
    expect(parsed).toHaveLength(0);
  });
});
