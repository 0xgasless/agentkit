import { Router } from "express";
import { createContext, getContext } from "../controllers/context.controller";

const router = Router();

router.post("/createContext", createContext);
router.get("/getContext", getContext);

export default router;
