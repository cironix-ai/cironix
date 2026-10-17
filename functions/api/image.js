import * as mod from "../../netlify/functions/image.js";
import { wrap } from "../_lib/adapter.js";
export const onRequest = wrap(mod);
