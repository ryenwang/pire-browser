import { page, providerBlocks } from "../../blocks.mjs";

const blocks = providerBlocks("Kernel", "KERNEL_API_KEY");

export default page({
  path: "/providers/kernel/",
  title: "Kernel",
  description: "Kernel boundary for local Firefox sessions.",
  blocks,
});
