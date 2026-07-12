import { Router, type IRouter } from "express";
import healthRouter from "./health";
import menuRouter from "./menu";
import ordersRouter from "./orders";
import customersRouter from "./customers";
import settingsRouter from "./settings";
import versionRouter from "./version";
import squareRouter from "./square";
import configRouter from "./config";
import deliveryRouter from "./delivery";
import webhooksRouter from "./webhooks";
import bridgeRouter from "./bridge";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(menuRouter);
router.use(ordersRouter);
router.use(customersRouter);
router.use(settingsRouter);
router.use(versionRouter);
router.use(squareRouter);
router.use(configRouter);
router.use(deliveryRouter);
router.use(webhooksRouter);
router.use("/bridge", bridgeRouter);
router.use("/dashboard", dashboardRouter);

export default router;
