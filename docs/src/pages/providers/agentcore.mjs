import { page, providerBlocks } from "../../blocks.mjs";

const blocks = providerBlocks("AgentCore", "PIRE_BROWSER_PROVIDER=agentcore");

export default page({
  path: "/providers/agentcore/",
  title: "AgentCore",
  description: "AgentCore boundary for local Firefox sessions.",
  blocks,
});
