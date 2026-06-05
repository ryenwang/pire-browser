import { page, providerBlocks } from "../../blocks.mjs";

const blocks = providerBlocks("Browserbase", "BROWSERBASE_API_KEY");

export default page({
  path: "/providers/browserbase/",
  title: "Browserbase",
  description: "Browserbase boundary for local Firefox sessions.",
  blocks,
});
