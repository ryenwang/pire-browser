import { page, providerBlocks } from "../../blocks.mjs";

const blocks = providerBlocks("Browser Use", "PIRE_BROWSER_PROVIDER=browseruse");

export default page({
  path: "/providers/browser-use/",
  title: "Browser Use",
  description: "Browser Use boundary for local Firefox sessions.",
  blocks,
});
