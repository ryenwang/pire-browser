import { page, providerBlocks } from "../../blocks.mjs";

const blocks = providerBlocks("Browserless", "BROWSERLESS_API_KEY");

export default page({
  path: "/providers/browserless/",
  title: "Browserless",
  description: "Browserless boundary for local Firefox sessions.",
  blocks,
});
