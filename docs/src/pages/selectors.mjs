import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const selectorsBlocks = [
  h2("Refs", "refs"),
  code(`pire-browser snapshot -i
pire-browser click '@e2'
pire-browser fill '@e3' "hello@example.com"`),
  p("Refs are the preferred selector for agent workflows. They are scoped to the current page state and should be refreshed after significant changes."),
  h2("CSS selectors", "css-selectors"),
  code(`pire-browser click "#submit"
pire-browser fill "input[name=email]" "hello@example.com"
pire-browser snapshot --selector "#main"`),
  h2("Semantic locators", "semantic-locators"),
  code(`pire-browser find role button --name "Submit" click
pire-browser find label "Email" fill "test@example.com"
pire-browser find text "Continue" click
pire-browser find placeholder "Search" fill "pire-browser"`),
  h2("Text and XPath", "text-and-xpath"),
  code(`pire-browser click "text=Continue"
pire-browser get text "xpath=//main//h1"`),
];

export default page({
  path: "/selectors/",
  title: "Selectors",
  description: "Refs, CSS selectors, and semantic locators.",
  blocks: selectorsBlocks,
});
