declare module "turndown-plugin-gfm" {
  import TurndownService from "turndown";

  export const gfm: (service: TurndownService) => void;
}
