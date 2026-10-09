import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

const repository = "https://github.com/SlipGuard-HQ/stellar-slipguard";

// The site is published as a GitHub Pages project site, so every asset and
// link is served from a sub-path rather than the domain root.
export default withMermaid(
  defineConfig({
    title: "SlipGuard",
    description:
      "Intent-based conditional orders with enforced slippage protection, built natively for Stellar and Soroban.",
    base: "/stellar-slipguard/",
    lang: "en-US",

    // The docs link out to repository files that live outside this folder
    // (SECURITY.md, deployments/). They are valid on GitHub but not routes in
    // this site, so they are not treated as dead links.
    ignoreDeadLinks: true,
    // docs/README.md is the GitHub-facing table of contents; the site root is
    // docs/index.md, so the README is not built as a page.
    srcExclude: ["README.md"],

    markdown: {
      lineNumbers: true,
    },

    themeConfig: {
      siteTitle: "SlipGuard",
      logo: "/logo.svg",

      search: {
        provider: "local",
      },

      nav: [
        { text: "Home", link: "/" },
        { text: "Introduction", link: "/01-introduction" },
        { text: "Developer guide", link: "/04-developer-guide" },
      ],

      sidebar: [
        {
          text: "Documentation",
          items: [
            { text: "1. Introduction", link: "/01-introduction" },
            { text: "2. Protocol mechanics", link: "/02-protocol-mechanics" },
            { text: "3. End-user guides", link: "/03-end-user-guides" },
            { text: "4. Developer guide", link: "/04-developer-guide" },
            { text: "5. Contract architecture", link: "/05-architecture" },
          ],
        },
      ],

      editLink: {
        pattern: `${repository}/edit/main/docs/:path`,
        text: "Edit this page on GitHub",
      },

      socialLinks: [{ icon: "github", link: repository }],

      footer: {
        message: "Released under the MIT License.",
        copyright: "SlipGuard HQ",
      },
    },
  }),
);
