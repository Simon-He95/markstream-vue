## [0.0.7](https://github.com/Simon-He95/markstream-vue/compare/v0.0.4-beta.8...v0.0.7) (2026-02-27)


### Bug Fixes

* add missing katex paths to configuration for proper module resolution ([b063980](https://github.com/Simon-He95/markstream-vue/commit/b06398058f71681571a0e948b045a10b31599c96))
* add regression tests for html_block splitting and update math plugin for legacy parentheses ([da4f46c](https://github.com/Simon-He95/markstream-vue/commit/da4f46c89135a1e7259a1bf4f71ad74e0750addb))
* add test for html_block splitting after `<br/>` ([f040f6c](https://github.com/Simon-He95/markstream-vue/commit/f040f6cb9bc35445bac17ced88c178c8ed8b642e)), closes [#251](https://github.com/Simon-He95/markstream-vue/issues/251)
* add type declarations for markdown-it plugins ([ec1517c](https://github.com/Simon-He95/markstream-vue/commit/ec1517c852d74df04c5632b42cebe89607027060))
* allow vertical scroll chain in table ([3716491](https://github.com/Simon-He95/markstream-vue/commit/3716491080c513dda1a3b79df2911f02c2395e96)), closes [#271](https://github.com/Simon-He95/markstream-vue/issues/271)
* **buttons:** update button styles to use :where() for better specificity and maintain Tailwind utilities ([314ec46](https://github.com/Simon-He95/markstream-vue/commit/314ec466f2f360037a5d71503f4ca5edc8487278))
* **changelog:** update release date and add missing bug fix entries ([6f453dc](https://github.com/Simon-He95/markstream-vue/commit/6f453dc8d158b2de24176c783860a3d6f5476d10))
* **changelog:** update version to 0.0.5 and add edge case render handling for math ([e75fed0](https://github.com/Simon-He95/markstream-vue/commit/e75fed0701a4a590328c623bc2dd656f6946f504))
* **changelog:** update version to 0.0.5-beta.1 and add missing bug fix entries ([b300251](https://github.com/Simon-He95/markstream-vue/commit/b30025199eeb80d4d5dfd81390d299ca41c4024c))
* **changelog:** update version to 0.0.5-beta.1 and add missing bug fix entries ([058730c](https://github.com/Simon-He95/markstream-vue/commit/058730c942c0bf16c2294fdaa07dc90f9784a7f4))
* **changelog:** update version to 0.0.5-beta.2 and add missing bug fix entries ([84f7824](https://github.com/Simon-He95/markstream-vue/commit/84f7824c4f7cd9ba3d50e805d9c2db15b232bd0d))
* correct math rendering syntax in test.vue ([a1c01e3](https://github.com/Simon-He95/markstream-vue/commit/a1c01e38c3ea3aa4b8a75354356774d703af3884))
* custom_html_tag 开头与内容未换行会导致格式错乱 [#236](https://github.com/Simon-He95/markstream-vue/issues/236) ([9141f75](https://github.com/Simon-He95/markstream-vue/commit/9141f75a209662bf8dc089dab2e499307a2842f3))
* **customBlock:** render wrong ([dc32504](https://github.com/Simon-He95/markstream-vue/commit/dc325044a95970f7173a9adbd7ebe0f6d4b2e7be)), closes [#225](https://github.com/Simon-He95/markstream-vue/issues/225)
* **dependencies:** update stream-markdown and stream-monaco versions to 0.0.13 and 0.0.10 respectively ([e363e3a](https://github.com/Simon-He95/markstream-vue/commit/e363e3afbdc86e76ab3d0727e3859eaed661b623))
* **dependencies:** update stream-monaco version to 0.0.12 across all packages ([b1b3097](https://github.com/Simon-He95/markstream-vue/commit/b1b309767dc19765b4b0915b17b48798b94143bc))
* **dependencies:** update stream-monaco version to 0.0.13 across all packages ([1e9dadd](https://github.com/Simon-He95/markstream-vue/commit/1e9dadd4685a4cb60689deac72c4e9cb7945588f))
* enhance HTML inline parsing to handle malformed custom tags and maintain valid attributes ([fadb904](https://github.com/Simon-He95/markstream-vue/commit/fadb904f3b312291ce3457acdf6a6e0dfca84112)), closes [#305](https://github.com/Simon-He95/markstream-vue/issues/305)
* enhance strong token parsing to correctly handle escaped asterisks ([97abc4a](https://github.com/Simon-He95/markstream-vue/commit/97abc4abd92aa1e8d16f72e635ee6d0396b9e6e1)), closes [#255](https://github.com/Simon-He95/markstream-vue/issues/255)
* **image:** inline with math parse wrong ([6a1c0fa](https://github.com/Simon-He95/markstream-vue/commit/6a1c0fa732da53b0d586d5d054aa9101730ac186))
* **image:** inline with math parse wrong ([edc7a44](https://github.com/Simon-He95/markstream-vue/commit/edc7a44d36598bb2ee2c0d3061a62c1201293646)), closes [#246](https://github.com/Simon-He95/markstream-vue/issues/246)
* improve HTML tag matching to support uppercase tag names in inline parsing ([7a3342d](https://github.com/Simon-He95/markstream-vue/commit/7a3342dda33f71c3e9b41e1ceb8e23c6e3b12304))
* improve reference detection in markdown parser and add related tests ([31e5b6e](https://github.com/Simon-He95/markstream-vue/commit/31e5b6eee57b85a838b0bdb2f71c29453c8d8902)), closes [#231](https://github.com/Simon-He95/markstream-vue/issues/231)
* improve vue2 compatibility ([6e58454](https://github.com/Simon-He95/markstream-vue/commit/6e58454bf178f33c2b1e5dff468dba97c0cd0cfc))
* **link:** inline code inside links rendering nested elements ([4f85231](https://github.com/Simon-He95/markstream-vue/commit/4f85231ef551391d1eb34f573e9a17563fe16c68)), closes [#256](https://github.com/Simon-He95/markstream-vue/issues/256)
* **markdown:** ensure strong tokens remain intact around inline math ([211aa48](https://github.com/Simon-He95/markstream-vue/commit/211aa482a0e506f288c0e7d86ada2f8cdf74bd7d)), closes [#276](https://github.com/Simon-He95/markstream-vue/issues/276)
* **markstream-react:** codeBlockNode collpase ([709460a](https://github.com/Simon-He95/markstream-vue/commit/709460a38fbf0130c9774f544fde6c10943d3c5f))
* **markstream-react:** HtmlPreviewFrame component use localized string for preview title ([903238c](https://github.com/Simon-He95/markstream-vue/commit/903238cd0e1d82c0729caad62bce19d7a62ff897))
* **markstream-react:** Restore cached SVG when switching from source to preview ([b2e294f](https://github.com/Simon-He95/markstream-vue/commit/b2e294f2e2c588d393755a0a8bcc1846fcd247f2))
* **markstream-react:** update mermaid modal titles to use localized strings ([852278a](https://github.com/Simon-He95/markstream-vue/commit/852278a3b53f211542e75b2329abb65a13429d41))
* **markstream-vue2:** test ([535a254](https://github.com/Simon-He95/markstream-vue/commit/535a254f408886a42898da26793db1e30dbdc912))
* **math:** add edge case render handling ([edbb347](https://github.com/Simon-He95/markstream-vue/commit/edbb3471f3b457c70fc35c924e384ebb1b014efc))
* **math:** edge case render ([e07cf4b](https://github.com/Simon-He95/markstream-vue/commit/e07cf4b3ae44aeeaeee9f93f4a6fb188ca12deda)), closes [#249](https://github.com/Simon-He95/markstream-vue/issues/249)
* **math:** prevent text duplication around escaped parentheses in inline math ([e80ac37](https://github.com/Simon-He95/markstream-vue/commit/e80ac37160b5782632d56391080b0f6f63618951)), closes [#277](https://github.com/Simon-He95/markstream-vue/issues/277)
* **mermaid:** add suppressErrorRendering to prevent diagram rendering errors ([0f10342](https://github.com/Simon-He95/markstream-vue/commit/0f103420906254e5f1df1c8eccf3040e8d5a1da5))
* **netlify.toml:** correct publish path and set base directory for build ([4c3e566](https://github.com/Simon-He95/markstream-vue/commit/4c3e5661d40dbf68f8b18398f38ece958505c41c))
* **netlify.toml:** remove base directory from build configuration ([41475ae](https://github.com/Simon-He95/markstream-vue/commit/41475aef2480f145ef057e0a9e7a19ef16502f58))
* **netlify.toml:** remove playground-nuxt from build command ([28e22ea](https://github.com/Simon-He95/markstream-vue/commit/28e22eac3832f269acf7387f090fea62bfce82b1))
* **netlify.toml:** update build command to include markstream-vue ([91ecf00](https://github.com/Simon-He95/markstream-vue/commit/91ecf00642e350b0b7a8074aa71aae902ba8837d))
* **netlify.toml:** update publish path to correct directory ([6bf3710](https://github.com/Simon-He95/markstream-vue/commit/6bf371089e06bf740ec64e71839999c76c7b3ce6))
* **nuxt.config.ts:** set nitro preset to static ([580e83e](https://github.com/Simon-He95/markstream-vue/commit/580e83e34487446d423e11b403c8f270240f70ac))
* **parser:** handle intraword asterisks and strict unmatched strong ([08ee3db](https://github.com/Simon-He95/markstream-vue/commit/08ee3db0aba56d650604be46eb406ff6b45351bb))
* prevent dropping numeric-only documents in parseMarkdownToStructure ([bba733c](https://github.com/Simon-He95/markstream-vue/commit/bba733c9a8d4b77f0fbd0560d695a611e0822eef)), closes [#278](https://github.com/Simon-He95/markstream-vue/issues/278)
* prevent false positives for JSON in math parsing and add tests ([0fb4e82](https://github.com/Simon-He95/markstream-vue/commit/0fb4e8291c092288e563f1289dbff4e94f90a7f1)), closes [#264](https://github.com/Simon-He95/markstream-vue/issues/264)
* **react:** generate bundled d.ts on build ([fb5c88b](https://github.com/Simon-He95/markstream-vue/commit/fb5c88b345eeec857e4aa5a95e3592659d2fa491))
* remove unnecessary blank lines in documentation and component files ([5f877e6](https://github.com/Simon-He95/markstream-vue/commit/5f877e61079b95ef3a78f1c8de7fe12328d85133)), closes [#243](https://github.com/Simon-He95/markstream-vue/issues/243)
* standardize class attribute syntax in list item components and tests ([71af12b](https://github.com/Simon-He95/markstream-vue/commit/71af12b1638456fdbaf809849f3f230ea9505de0))
* **theme:** toggle fail ([39cd71a](https://github.com/Simon-He95/markstream-vue/commit/39cd71af0c499c95d9c50b9770972540ac83c3ef)), closes [#233](https://github.com/Simon-He95/markstream-vue/issues/233)
* update changelog to include regression tests for html_block splitting and math plugin updates ([64008d6](https://github.com/Simon-He95/markstream-vue/commit/64008d6e81031a7504c9945ab0186e46f646bc2a))
* update changelog to include regression tests for html_block splitting and math plugin updates ([f676144](https://github.com/Simon-He95/markstream-vue/commit/f67614451b14201e5e816b414ecc70a89cb65dea))
* update changelog with new bug fixes and enhancements ([0e2f703](https://github.com/Simon-He95/markstream-vue/commit/0e2f703d74f13066bd613d82b01ccb371a1f2301))
* update demo links for Nuxt and Vue 2 in documentation ([c8a9b52](https://github.com/Simon-He95/markstream-vue/commit/c8a9b528eeeb64e9c34d1a86dd74dcbbe32fa6dd))
* update demo links for React and Nuxt in documentation ([d6f76e0](https://github.com/Simon-He95/markstream-vue/commit/d6f76e0656cd09ec4dd6ce3b77dcc815089ef29a))
* update docs build process to include parser build step ([66195fa](https://github.com/Simon-He95/markstream-vue/commit/66195fa122ff537744244cd311b73f787f16608f))
* update import statements for MarkdownRender to use default export ([e1c6280](https://github.com/Simon-He95/markstream-vue/commit/e1c6280dfebb13010c87ff0c076da9fba419a5eb)), closes [#285](https://github.com/Simon-He95/markstream-vue/issues/285)
* update math plugin to handle legacy parentheses and add regression test for `<think>` blocks ([b04a75d](https://github.com/Simon-He95/markstream-vue/commit/b04a75dfa863fbadf0980b83f79348ccbd79419d)), closes [#252](https://github.com/Simon-He95/markstream-vue/issues/252)
* update snapshot styles for inline and reference nodes to use consistent background colors ([a62b67d](https://github.com/Simon-He95/markstream-vue/commit/a62b67d4b6174d5aeda86253f568986a51f742f9))
* update stream-monaco version to 0.0.14 in package.json and pnpm-lock.yaml ([47fcf1a](https://github.com/Simon-He95/markstream-vue/commit/47fcf1a816eeebcba5356e90f4c7a390f6f3a67b))
* update stream-monaco version to 0.0.15 in package.json and pnpm-lock.yaml; enhance CodeBlockNode to handle dynamic editor kind switching in streaming scenarios ([1cae7e0](https://github.com/Simon-He95/markstream-vue/commit/1cae7e029e3f9174e9ebc9eaaab47f48d212b4c4))
* update vue-i18n to version 11.2.8 in package.json and pnpm-lock.yaml ([9bf1d0f](https://github.com/Simon-He95/markstream-vue/commit/9bf1d0fb914dfc4a8e7f8bb28e855667616e1b70))
* **vite.config.ts:** adjust alias resolution for development mode only ([7530877](https://github.com/Simon-He95/markstream-vue/commit/7530877c3773c59cdc623816cd3f25f75daa6e40))
* 删掉开发文档中mermaid单独引入样式文件的错误说明 ([ba58a50](https://github.com/Simon-He95/markstream-vue/commit/ba58a504e2a15ef5128e7a761a3947b1fc8e9ab7))


### Features

* add '@antv/infographic' to dependencies in Vite configuration files ([6063ae4](https://github.com/Simon-He95/markstream-vue/commit/6063ae4826b206673999a43b7482564524204be0))
* add AntV Infographic guide pages and update navigation configuration. ([0b64836](https://github.com/Simon-He95/markstream-vue/commit/0b64836068def70cadea54a27df06ec40ab47ca4))
* add attrs support to HeadingNode components and tests ([b148aea](https://github.com/Simon-He95/markstream-vue/commit/b148aea52265a204ef4d043d99b13d313c048a78))
* add D2 support across packages ([0c0f071](https://github.com/Simon-He95/markstream-vue/commit/0c0f07182b897e596b33f7a5988dcd899e9adfd5))
* add D2BlockNode component to global components declaration ([2df44db](https://github.com/Simon-He95/markstream-vue/commit/2df44db819687018aecdbf548a9781eeb6d928d9))
* add ECharts integration documentation in English and Chinese ([b39a993](https://github.com/Simon-He95/markstream-vue/commit/b39a99399f74244e2acada3e3a96fee9ce5a52c0))
* add escapeHtmlTags option to render specific HTML-like tags as literal text ([74f2798](https://github.com/Simon-He95/markstream-vue/commit/74f2798f19e27926933eab30c36fd44bb71141eb)), closes [#261](https://github.com/Simon-He95/markstream-vue/issues/261)
* add GitHub star badge component and update documentation to encourage starring the project ([63d5e9a](https://github.com/Simon-He95/markstream-vue/commit/63d5e9a7185c79b5bbade651ef5b9c3e29c40712))
* Add InfographicBlockNode component and integrate  rendering for code blocks. ([1c0e74d](https://github.com/Simon-He95/markstream-vue/commit/1c0e74d21ad9f6940699358d3e3d1db41b4009de))
* add normalization for custom HTML opening tags at line start ([aafd530](https://github.com/Simon-He95/markstream-vue/commit/aafd530d372b15888e72a960a5cff7d6c8e27f37))
* add playground-vue2-cli to pnpm workspace ([36d4101](https://github.com/Simon-He95/markstream-vue/commit/36d410125346b62f7e8d68d327b9ec923bbe31f7))
* add push options for tagging scripts in package.json ([9e46cb1](https://github.com/Simon-He95/markstream-vue/commit/9e46cb10a7f062bc2679648e61639f065e30a9dd))
* add settings panel for theme selection, stream delay, and chunk size adjustments ([01129ee](https://github.com/Simon-He95/markstream-vue/commit/01129ee6a0d86ac0d364471683f5c6b282a9219e)), closes [#282](https://github.com/Simon-He95/markstream-vue/issues/282)
* add support for blank line after custom HTML close before block marker ([4e4e31b](https://github.com/Simon-He95/markstream-vue/commit/4e4e31bb804fe76401c9283f215c6e43135f362c)), closes [#295](https://github.com/Simon-He95/markstream-vue/issues/295)
* add support for fixing indented code blocks and enhance HTML inline handling ([733bf40](https://github.com/Simon-He95/markstream-vue/commit/733bf409f05de3704199f9274a62f48ea5d0f4e4)), closes [#257](https://github.com/Simon-He95/markstream-vue/issues/257)
* add Tailwind CSS support to markstream-vue2 ([b6a8b20](https://github.com/Simon-He95/markstream-vue/commit/b6a8b20c65a451eb684c80b238149320f208799f))
* add tests for validateLink ([961a914](https://github.com/Simon-He95/markstream-vue/commit/961a914b62ee715b4fd902010d4fb3fa2f7aed7a))
* delete temporary patch file ([e931d8b](https://github.com/Simon-He95/markstream-vue/commit/e931d8bc414833194aebebe23fafa8379d7bde41))
* **docs:** update playground links and add local running instructions ([2ec2745](https://github.com/Simon-He95/markstream-vue/commit/2ec27456fed6b0b0432e92b67753d51bbf42ad89))
* enhance ::: container syntax to support args and improve JSON matching ([4b3bbf7](https://github.com/Simon-He95/markstream-vue/commit/4b3bbf707e7f58e9b2f935ac58d353567eeebb0d)), closes [#233](https://github.com/Simon-He95/markstream-vue/issues/233)
* enhance D2BlockNodeProps interface with additional properties ([9f8ac87](https://github.com/Simon-He95/markstream-vue/commit/9f8ac87ccd1826711119a6842e8f816eeed7da74))
* enhance documentation and components for Shiki and Monaco integration ([588358c](https://github.com/Simon-He95/markstream-vue/commit/588358cd605b6e529357a410dcc0efb87d3decd7)), closes [#279](https://github.com/Simon-He95/markstream-vue/issues/279)
* enhance documentation structure and content for multiple frameworks ([293511d](https://github.com/Simon-He95/markstream-vue/commit/293511d0226c353f8e7874d69a58daa17cbc1d4a))
* enhance handling of custom HTML tags in inline contexts and tables ([c86efd8](https://github.com/Simon-He95/markstream-vue/commit/c86efd816012a2a8e59ace7cb7ef7052df883983))
* enhance HTML rendering and custom component handling ([005b325](https://github.com/Simon-He95/markstream-vue/commit/005b325cc20450b327537884e3a275d3f03a8749))
* enhance HtmlBlockNode and HtmlInlineNode for improved streaming stability and add tests ([28b408f](https://github.com/Simon-He95/markstream-vue/commit/28b408f8f491aff4cdab4f18bea1ed8dd4c6e4f7)), closes [#273](https://github.com/Simon-He95/markstream-vue/issues/273)
* enhance link parsing to handle CJK punctuation and ASCII correctly ([ac7ee04](https://github.com/Simon-He95/markstream-vue/commit/ac7ee047575aae014ae13a01b59e83010aa8a8fd)), closes [#296](https://github.com/Simon-He95/markstream-vue/issues/296)
* enhance ListNode and ListItemNode to support custom components and improve rendering logic ([db4139b](https://github.com/Simon-He95/markstream-vue/commit/db4139b74688327d65e1769f2b2ab06cf47338a4))
* enhance math parsing to support mixed $ and $$ delimiters ([1c41182](https://github.com/Simon-He95/markstream-vue/commit/1c41182cf4c9c8c40a466be5c43ed1bcbb5d459a)), closes [#263](https://github.com/Simon-He95/markstream-vue/issues/263)
* enhance Monaco integration with Webpack support and add tests ([e2868d8](https://github.com/Simon-He95/markstream-vue/commit/e2868d8cc04521e9775004687549cc98a90784d5)), closes [#269](https://github.com/Simon-He95/markstream-vue/issues/269)
* enhance package.json with detailed descriptions, author info, repository links, and keywords for markstream-react and markstream-vue2 ([adff129](https://github.com/Simon-He95/markstream-vue/commit/adff129f5597a480b13058e84c2019807d556c8a))
* enhance README with framework options and additional sections for community support ([bc1f872](https://github.com/Simon-He95/markstream-vue/commit/bc1f872e7da55e35bebb9e34e00ea7543b59aa20))
* enhance release process with tagging scripts and update .gitignore ([37add6a](https://github.com/Simon-He95/markstream-vue/commit/37add6a316072380d45c837d94fe00d1709c58f5))
* Implement HTML Renderer with comprehensive tests ([c96433e](https://github.com/Simon-He95/markstream-vue/commit/c96433ecb4519f9957499f155e3485976aeb3eb1)), closes [#221](https://github.com/Simon-He95/markstream-vue/issues/221)
* implement nightly and stable release workflows with tagging support ([7de79bf](https://github.com/Simon-He95/markstream-vue/commit/7de79bf589eff64b3f5c41563181b491bc3bd7cc))
* improve handling of ordered lists during streaming to prevent transient gaps and add corresponding tests ([37590a7](https://github.com/Simon-He95/markstream-vue/commit/37590a7ab31611b958b46bac47241f2d0df4a07b))
* improve link parsing to handle multiple adjacent links correctly ([42ba963](https://github.com/Simon-He95/markstream-vue/commit/42ba963fb1c7d100d5519f213622380255d3d349)), closes [#240](https://github.com/Simon-He95/markstream-vue/issues/240)
* integrate Tailwind CSS support and update styles for markstream-react ([4e4db11](https://github.com/Simon-He95/markstream-vue/commit/4e4db117f8f951bfa18e852f33cd77748f85d98b))
* replace space-x-* classes with gap-x-* for consistent spacing in header slots ([602baa5](https://github.com/Simon-He95/markstream-vue/commit/602baa5746813309bbe12605469c932d8c832e9c)), closes [#223](https://github.com/Simon-He95/markstream-vue/issues/223)
* update CHANGELOG for v0.0.4 release with bug fixes and new features ([5f79584](https://github.com/Simon-He95/markstream-vue/commit/5f79584012639f042543508170af66a9cb631934))
* update CHANGELOG for v0.0.4 release with bug fixes and new features ([4835a8f](https://github.com/Simon-He95/markstream-vue/commit/4835a8fbcfb15fbc654a849f5017f04b5a824b59))
* update CHANGELOG with new features and enhancements for release process ([e98336b](https://github.com/Simon-He95/markstream-vue/commit/e98336b0f26efab73985120c37c1a017c6606b61))
* **VmrContainerNode:** add mid-state loading ([016f1ed](https://github.com/Simon-He95/markstream-vue/commit/016f1ed37f25e9f6f74856d385aa62514d556f32))
* **VmrContainerNode:** enhance streaming behavior with loading state and incomplete JSON handling ([beef82b](https://github.com/Simon-He95/markstream-vue/commit/beef82bcdc5fb78d2d9c7d3becc70cb075d1d380))



## [0.0.4-beta.8](https://github.com/Simon-He95/markstream-vue/compare/v0.0.4-beta.7...v0.0.4-beta.8) (2025-12-31)


### Bug Fixes

* enhance table loading behavior to prevent layout jitter ([5bd2fa5](https://github.com/Simon-He95/markstream-vue/commit/5bd2fa5c716830e2bc239bdbe5775cd067c0d56a))
* update prepublishOnly script to include pnpm publish ([03826d5](https://github.com/Simon-He95/markstream-vue/commit/03826d5f92785d771ab5610223276abecb4caf51))


### Features

* add Terser minification for worker bundles in Vite configuration ([66dee23](https://github.com/Simon-He95/markstream-vue/commit/66dee2367ca53c4904db0e7d3c5daaefffe59404))
* **docs:** add Chinese documentation for React and Vue 2 installation, quick start, and components ([c6b5c84](https://github.com/Simon-He95/markstream-vue/commit/c6b5c842910c10337d7ec007ba16f07cd8f20136))
* implement monaco theme management and update copy event handling in CodeBlockNode and MermaidBlockNode ([70c336e](https://github.com/Simon-He95/markstream-vue/commit/70c336ed16b69acfdca40a22f3bbd70d33a20344))
* **parser:** enhance data attribute parsing in VmrContainer to support JSON values ([1221e03](https://github.com/Simon-He95/markstream-vue/commit/1221e03b7c65c7f6ba5a35857b2803bcc16908d6))



## [0.0.4-beta.7](https://github.com/Simon-He95/markstream-vue/compare/v0.0.52...v0.0.4-beta.7) (2025-12-31)


### Bug Fixes

* update packageManager version to pnpm@10.27.0 in package.json files ([1e94070](https://github.com/Simon-He95/markstream-vue/commit/1e94070bec2bffc4f2cb14902435535426f069b4))



## [0.0.52](https://github.com/Simon-He95/markstream-vue/compare/v0.0.4-beta.6...v0.0.52) (2025-12-31)


### Bug Fixes

* add missing release script to package.json for markdown-parser ([72ef4d3](https://github.com/Simon-He95/markstream-vue/commit/72ef4d3fc1487c2d8955a9670bb645737be5846a))
* add missing release script to package.json for markstream-react and markstream-vue2 ([2e8a717](https://github.com/Simon-He95/markstream-vue/commit/2e8a7174d765ad5bf5a2d4d42567efeb84136f15))


### Features

* preserve complex JSON attributes in vmr_container ([639956b](https://github.com/Simon-He95/markstream-vue/commit/639956b9b2b45648108c36809247ccc80e63ca27))



## [0.0.4-beta.6](https://github.com/Simon-He95/markstream-vue/compare/v0.0.4-beta.5...v0.0.4-beta.6) (2025-12-30)


### Features

* add renderer context and improve custom components management ([2ffebe1](https://github.com/Simon-He95/markstream-vue/commit/2ffebe10b2d0956f772cf846e9f15a59b542f5cf))
* **CodeBlockNode:** enhance viewport handling and loading state management; refactor MathBlockNode rendering logic ([1391759](https://github.com/Simon-He95/markstream-vue/commit/1391759cb12206629c171dc87d79c784361705d8))
* enhance code block rendering with pre fallback and improved table layout ([39256c6](https://github.com/Simon-He95/markstream-vue/commit/39256c65fdd6ef06781ff4805017f5c2dc9ff47e))
* **playground-react:** initialize React playground with Vite and Tailwind CSS ([0e2d463](https://github.com/Simon-He95/markstream-vue/commit/0e2d463192dc19f7f868a11e2eb28b1e4627bc64))



## [0.0.4-beta.5](https://github.com/Simon-He95/markstream-vue/compare/v0.0.4-beta.4...v0.0.4-beta.5) (2025-12-27)


### Features

* enhance ::: container parsing to support whitespace and variant syntax ([0ed7e34](https://github.com/Simon-He95/markstream-vue/commit/0ed7e348292baf8f3de04c9943138b291eb95b36)), closes [#212](https://github.com/Simon-He95/markstream-vue/issues/212)
* update AI/LLM context links in documentation for consistency ([6efb1b2](https://github.com/Simon-He95/markstream-vue/commit/6efb1b26d8e8df08f6c75c8785c4aae3e90805ba))



## [0.0.4-beta.4](https://github.com/Simon-He95/markstream-vue/compare/v0.0.4-beta.3...v0.0.4-beta.4) (2025-12-25)


### Bug Fixes

* **math:** some case stuck ([f525b5c](https://github.com/Simon-He95/markstream-vue/commit/f525b5c66f82bd0be707db4d2150ab841a65972e)), closes [#214](https://github.com/Simon-He95/markstream-vue/issues/214)


### Features

* add AI/LLM context links to documentation and README files ([ce01981](https://github.com/Simon-He95/markstream-vue/commit/ce019811deb31809b7a3e22e3cb71f6f34c9f297))



## [0.0.4-beta.3](https://github.com/Simon-He95/markstream-vue/compare/v0.0.4-beta.2...v0.0.4-beta.3) (2025-12-24)


### Features

* implement final mode for parser to handle end-of-stream scenarios and improve rendering stability ([c2ef2c1](https://github.com/Simon-He95/markstream-vue/commit/c2ef2c15259b54b8971216da4c09066418d0dd31)), closes [#213](https://github.com/Simon-He95/markstream-vue/issues/213)



## [0.0.4-beta.2](https://github.com/Simon-He95/markstream-vue/compare/v0.0.4-beta.1...v0.0.4-beta.2) (2025-12-24)


### Features

* add CDN support for KaTeX and Mermaid with dedicated workers ([7973cbc](https://github.com/Simon-He95/markstream-vue/commit/7973cbcb1aee3fc0a2b934ddf261309ab7a67492))



## [0.0.4-beta.1](https://github.com/Simon-He95/markstream-vue/compare/v0.0.4-beta.0...v0.0.4-beta.1) (2025-12-24)


### Bug Fixes

* update rendering description for custom container blocks in documentation ([a93f371](https://github.com/Simon-He95/markstream-vue/commit/a93f3714a754e83b28b0a76fe3f4f25306a3e109))


### Features

* update VmrContainerNode component to support additional node types and improve rendering logic ([0a2b4a8](https://github.com/Simon-He95/markstream-vue/commit/0a2b4a82f167cda95d017515a91366fdb7e9ea8d)), closes [#212](https://github.com/Simon-He95/markstream-vue/issues/212)



## [0.0.4-beta.0](https://github.com/Simon-He95/markstream-vue/compare/v0.0.3-beta.9...v0.0.4-beta.0) (2025-12-23)


### Features

* add fenced code block handling to stripDanglingHtmlLikeTail and implement regression tests ([89ea8e6](https://github.com/Simon-He95/markstream-vue/commit/89ea8e6ad51947208bca2c630409d88c72668c3f)), closes [#206](https://github.com/Simon-He95/markstream-vue/issues/206)
* implement VmrContainerNode component and parser for custom ::: containers ([fe07067](https://github.com/Simon-He95/markstream-vue/commit/fe0706745fa2478ad1d5c857efdae7fef135e10f))



## [0.0.3-beta.9](https://github.com/Simon-He95/markstream-vue/compare/v0.0.3-beta.8...v0.0.3-beta.9) (2025-12-20)



## [0.0.3-beta.8](https://github.com/Simon-He95/markstream-vue/compare/v0.0.3-beta.7...v0.0.3-beta.8) (2025-12-20)


### Bug Fixes

* enhance handling of inline math within strong markup and add related tests ([1397496](https://github.com/Simon-He95/markstream-vue/commit/139749660ca4ffbba966085abc914bcd2311f118))
* improve viewport priority handling and add tests for node deferral behavior ([da9c8e0](https://github.com/Simon-He95/markstream-vue/commit/da9c8e0c964e0f4f45383a4dc5c45ab4d3291fa7)), closes [#206](https://github.com/Simon-He95/markstream-vue/issues/206)
* update .gitignore to include dist-tw and refactor MermaidBlockNode loading ([2cc87dd](https://github.com/Simon-He95/markstream-vue/commit/2cc87ddd01db13b9b55e726816624c30af6f4ffe))
* update package versions for improved compatibility and performance ([36ec68f](https://github.com/Simon-He95/markstream-vue/commit/36ec68fc0a1cb6d9a8e22a0a9e85aa90dff75851))
* update packageManager and dependencies to latest versions ([bb2778a](https://github.com/Simon-He95/markstream-vue/commit/bb2778a22831ccb4d79987aceb1324359abf8609))



## [0.0.3-beta.7](https://github.com/Simon-He95/markstream-vue/compare/v0.0.3-beta.6...v0.0.3-beta.7) (2025-12-18)


### Bug Fixes

* **type:**  parseMarkdownToStructure ([65b2b6d](https://github.com/Simon-He95/markstream-vue/commit/65b2b6d335441e8296899775cea713b0cb95ac5e)), closes [#204](https://github.com/Simon-He95/markstream-vue/issues/204)
* update MermaidBlockNode to load asynchronously and handle missing dependencies ([ff67177](https://github.com/Simon-He95/markstream-vue/commit/ff67177d1bee5403b4741a1294d6c7e1ba808d2d))



## [0.0.3-beta.6](https://github.com/Simon-He95/markstream-vue/compare/v0.0.3-beta.5...v0.0.3-beta.6) (2025-12-16)


### Bug Fixes

* custom html token ([f89c9d1](https://github.com/Simon-He95/markstream-vue/commit/f89c9d1ece23b5bcb01838b9d8a2b511787ea7f9)), closes [#202](https://github.com/Simon-He95/markstream-vue/issues/202)
* update snapshot tests to reflect changes in class names for markdown renderer ([17991df](https://github.com/Simon-He95/markstream-vue/commit/17991dfdb9582f7a2950d1a3800a959d03cdd511))



## [0.0.3-beta.5](https://github.com/Simon-He95/markstream-vue/compare/v0.0.3-beta.4...v0.0.3-beta.5) (2025-12-15)


### Bug Fixes

* correct node_version format in CI configuration ([50e32a8](https://github.com/Simon-He95/markstream-vue/commit/50e32a878d160fe801c4dc29ce11cf0d7c6a6507))
* handle 'text_special' token type as plain text in parseInlineTokens function ([8106e01](https://github.com/Simon-He95/markstream-vue/commit/8106e0182730d0b7523735c27fc6ac322c43b200))
* merge 'text_special' token type into adjacent text nodes in parseInlineTokens function ([2d70bc0](https://github.com/Simon-He95/markstream-vue/commit/2d70bc0779e497b528959a8b33ddfbd587e553c2))
* update dependencies in package.json and pnpm-lock.yaml ([8fd5a2b](https://github.com/Simon-He95/markstream-vue/commit/8fd5a2ba3b43db3c0d6c6670ca6cb4e0ff8de06d))
* update license links and improve documentation consistency across files ([01b840b](https://github.com/Simon-He95/markstream-vue/commit/01b840bdef4db118cf221b3247977f10f8b660c9))
* update stream-markdown-parser to version 0.0.42 and add tests for inline text_special tokens ([895e8ab](https://github.com/Simon-He95/markstream-vue/commit/895e8ab4c7e22c7105ffc91a714538f2e6eb84fc)), closes [#198](https://github.com/Simon-He95/markstream-vue/issues/198)



## [0.0.3-beta.4](https://github.com/Simon-He95/markstream-vue/compare/v0.0.3-beta.3...v0.0.3-beta.4) (2025-12-12)


### Features

* add support for custom HTML-like tags in markdown parser ([5850170](https://github.com/Simon-He95/markstream-vue/commit/5850170eb452b8c09ee805ff0102b9bb1e53c40e))
* enhance HTML inline handling and support for custom tags in markdown parser ([6864479](https://github.com/Simon-He95/markstream-vue/commit/68644791db7402da6d7297d0eef8fe8be3c56a98))



## [0.0.3-beta.3](https://github.com/Simon-He95/markstream-vue/compare/v0.0.3-beta.2...v0.0.3-beta.3) (2025-12-12)


### Bug Fixes

* correct formatting of node_version in CI configuration ([3bea48c](https://github.com/Simon-He95/markstream-vue/commit/3bea48c6354124129dad63a02cc7a8b2220bed15))
* resolve issue with extraneous text being included in links ([98b4677](https://github.com/Simon-He95/markstream-vue/commit/98b467735a38444b9f896b265c9ecad3d496c0c3)), closes [#195](https://github.com/Simon-He95/markstream-vue/issues/195)


### Features

* add isPlainBracketMathLike function to improve math parsing logic and enhance mid-state handling in tests ([6613da9](https://github.com/Simon-He95/markstream-vue/commit/6613da96f9320fa5f639b5fbac9bfcc16df1efcd)), closes [#197](https://github.com/Simon-He95/markstream-vue/issues/197)
* add isStrict prop for enhanced security in Mermaid rendering ([7121966](https://github.com/Simon-He95/markstream-vue/commit/71219662772620b041e4abec68b4d018ba9ddc25))
* add KaTeX to dependencies in README files ([3073ef6](https://github.com/Simon-He95/markstream-vue/commit/3073ef6642ff832471d6970b46bee7c3bbc3800a))
* implement streaming inline HTML mid-states with auto-closing support and suppress partial tags ([aa0635f](https://github.com/Simon-He95/markstream-vue/commit/aa0635f5b2dd1ceaf7421ec4bfbace1ede480cab)), closes [#194](https://github.com/Simon-He95/markstream-vue/issues/194)



## [0.0.3-beta.2](https://github.com/Simon-He95/markstream-vue/compare/v0.0.3-beta.1...v0.0.3-beta.2) (2025-12-11)


### Bug Fixes

* correct formatting and translation inconsistencies in performance analysis document ([320b879](https://github.com/Simon-He95/markstream-vue/commit/320b879351f0049681f44a745c6d8c44c0a355f6))
* ensure passive touch listeners for Monaco editor to prevent Chrome warnings ([d544d8f](https://github.com/Simon-He95/markstream-vue/commit/d544d8fbc1cc151381f6b71156627c33ccd3ad4f))
* remove unused mermaidWrapper reference in MermaidBlockNode component ([6585105](https://github.com/Simon-He95/markstream-vue/commit/6585105c0f110f28610d00f714cb543b565966f3))
* viewport render ([9ae63a2](https://github.com/Simon-He95/markstream-vue/commit/9ae63a20bfcf37019b59abd1dbe474dce7df586c)), closes [#192](https://github.com/Simon-He95/markstream-vue/issues/192)


### Features

* add contribution guidelines, code of conduct, and security policy ([4283a9a](https://github.com/Simon-He95/markstream-vue/commit/4283a9a00141f0f94d743ab4ad960d9bbc43cc58))
* add strict mode for enhanced security in MermaidBlockNode ([8cfdbd2](https://github.com/Simon-He95/markstream-vue/commit/8cfdbd28e0328142b6999df5e4eea8aca6ab659c))
* enhance Markdown code block rendering with fallback and improved state management ([5a71844](https://github.com/Simon-He95/markstream-vue/commit/5a71844df29f150894c277da205f0c6075a00afe))
* implement HtmlInlineNode component and enhance inline HTML parsing ([fe6cb48](https://github.com/Simon-He95/markstream-vue/commit/fe6cb48afc722930f0c0ae645de208e757a79959)), closes [#119](https://github.com/Simon-He95/markstream-vue/issues/119)



## [0.0.3-beta.1](https://github.com/Simon-He95/markstream-vue/compare/v0.0.3-beta.0...v0.0.3-beta.1) (2025-12-10)


### Bug Fixes

* update stream-markdown-parser dependency to version 0.0.36 ([12bd02b](https://github.com/Simon-He95/markstream-vue/commit/12bd02bc7fbb03c4f406ba24ce09bb2fd1d38a2a))



## [0.0.3-beta.0](https://github.com/Simon-He95/markstream-vue/compare/v0.0.63-beta.4...v0.0.3-beta.0) (2025-12-09)


### Bug Fixes

* adjust math parsing logic to correctly handle text before math commands ([2c69750](https://github.com/Simon-He95/markstream-vue/commit/2c6975066355fa9b25ef5cf207b925e97731a84f)), closes [#182](https://github.com/Simon-He95/markstream-vue/issues/182)
* **CodeBlockNode, MermaidBlockNode:** add overflow handling and text truncation for better layout ([1731e38](https://github.com/Simon-He95/markstream-vue/commit/1731e38e0c30ea8b276d66901a7ff84f1d80eab5))
* **CodeBlockNode:** language ([d244304](https://github.com/Simon-He95/markstream-vue/commit/d2443046a3fded18d182d87f80daf231e1dc25ef))
* Component StrongNode will call its own but dose not import self ([77e2076](https://github.com/Simon-He95/markstream-vue/commit/77e2076186c29a66be7d8d6e045f80a1c4115436))
* enhance markdown parsing and math command recognition ([25d66f3](https://github.com/Simon-He95/markstream-vue/commit/25d66f30c3cce85286fdddfa4e4bdf9e31ef32d8))
* enhance strong and emphasis token handling in parser ([dfb19de](https://github.com/Simon-He95/markstream-vue/commit/dfb19de48c0e825b3e2c8ac5ec6151ddc357926e))
* **fixLinkToken:** remove unnecessary increment for link token processing ([6889eea](https://github.com/Simon-He95/markstream-vue/commit/6889eea2801393767c0fc46db460e23ac06f3acf))
* handle loading state in link tokens and improve math token parsing ([4be4f1f](https://github.com/Simon-He95/markstream-vue/commit/4be4f1f11712875d3b4836f580642acd600c1900))
* **html-inline:** br -> hardbreak ([3508b4e](https://github.com/Simon-He95/markstream-vue/commit/3508b4ec9b908328b38e5d3040dcfa69e4196cb6))
* improve handling of nodes and height estimation in NodeRenderer ([f6de5bd](https://github.com/Simon-He95/markstream-vue/commit/f6de5bda4cdb3a25e2e4fc19e1617d02847b1ae1))
* improve math block detection logic for inline formulas ([31b881f](https://github.com/Simon-He95/markstream-vue/commit/31b881f44ee64c6bf76717cb22f7e33b093989fe))
* **LinkNode:** improve tooltip text fallback logic and conditionally set title attribute ([88726a6](https://github.com/Simon-He95/markstream-vue/commit/88726a67ac2402b6f3f81b4a4cc83756e3c442f5))
* **MarkdownCodeBlockNode:** render empty ([f7b2948](https://github.com/Simon-He95/markstream-vue/commit/f7b294879621b150ad9014c8feca38fe45d2a761))
* **math_inline:** edge case ([37a0861](https://github.com/Simon-He95/markstream-vue/commit/37a0861e2e4e887437045ed9f4b007f225df2ad2))
* parser strong wrong ([310f4ef](https://github.com/Simon-He95/markstream-vue/commit/310f4efb6e0d999dc659dac14e2852b48c7085be))
* render stack ([b232b54](https://github.com/Simon-He95/markstream-vue/commit/b232b54c0f18a55ad75b03f0e18f4f39d3499e68))
* **setCustomNodeComponents:** cover all deep components ([e4ae1fb](https://github.com/Simon-He95/markstream-vue/commit/e4ae1fbe8251dd23c7df419428458349346e26ad)), closes [#181](https://github.com/Simon-He95/markstream-vue/issues/181)
* some link render ([185b25f](https://github.com/Simon-He95/markstream-vue/commit/185b25fc636535fd94aa2e98a35c97abf5e0a324))
* stream-markdown-parser ([f9365db](https://github.com/Simon-He95/markstream-vue/commit/f9365dbe3c309124b3b741a4d8292ab4a9c1f2f9))
* the CodeBlockNode component should have its expansion length recalculated ([2f9537a](https://github.com/Simon-He95/markstream-vue/commit/2f9537af5e8a1b8ad7a3ba04d0db6e87f355e4c0))
* update dependencies for vitest and vue-i18n to latest versions ([dfaae55](https://github.com/Simon-He95/markstream-vue/commit/dfaae552b9f7380c83d2172aa34442fa0e5e7d88))
* update markdown-it-ts to version 0.0.2-beta.7 in package.json and pnpm-lock.yaml ([dbef4d6](https://github.com/Simon-He95/markstream-vue/commit/dbef4d694f343b76d9938c1efd53870199c5655a))
* update markdown-it-ts to version 0.0.2-beta.9 in package.json and pnpm-lock.yaml ([5e38502](https://github.com/Simon-He95/markstream-vue/commit/5e38502f4458fb8d1c9e1f909a04f1b64d455df0))
* update markstream-vue version to 0.0.2-beta.0 in pnpm-lock.yaml ([a8a2db5](https://github.com/Simon-He95/markstream-vue/commit/a8a2db509e4997488efe3fbf16636d189447a423))
* update node components to prioritize default components over custom overrides ([ea39635](https://github.com/Simon-He95/markstream-vue/commit/ea39635e6092a3a91f57f34457441ccb012fd705)), closes [#185](https://github.com/Simon-He95/markstream-vue/issues/185)
* update stream-markdown and stream-monaco dependencies to latest versions ([3586f5f](https://github.com/Simon-He95/markstream-vue/commit/3586f5f1297d51a7515fd4b6d954312e94a551eb))
* update stream-markdown-parser and markdown-it-ts to latest versions ([f6d262e](https://github.com/Simon-He95/markstream-vue/commit/f6d262e36e7d1215b7a61d37f16628bb08d63080))
* update stream-markdown-parser to v0.0.34 and improve block parsing logic ([ebc7fad](https://github.com/Simon-He95/markstream-vue/commit/ebc7fad43213a46b1daaeb82d981ec0a6388a55c)), closes [#175](https://github.com/Simon-He95/markstream-vue/issues/175) [#176](https://github.com/Simon-He95/markstream-vue/issues/176)
* update version to 0.0.32 in package.json ([2623793](https://github.com/Simon-He95/markstream-vue/commit/2623793d11393f79292e962addf49a90cd42cdc9))


### Features

* add CodeBlockNode and MermaidBlockNode components with detailed documentation ([b27ed27](https://github.com/Simon-He95/markstream-vue/commit/b27ed27a7b7415ef4a744098322b0e827d229a9b))
* add debug option for parsed tree structure and update playground for testing ([ff01c1e](https://github.com/Simon-He95/markstream-vue/commit/ff01c1ed6c07bbd203766089741ebb4b51e52c67))
* add footnote anchor component and update footnote handling ([d2bdd5d](https://github.com/Simon-He95/markstream-vue/commit/d2bdd5d1dd22071f8714355edc7fc00f4ee28f20))
* add HTML/SVG preview dialog with customizable behavior ([ba2efd5](https://github.com/Simon-He95/markstream-vue/commit/ba2efd5a12ea30fd8de516ec2f54ca536537fd68))
* add HtmlPreviewFrame component for inline HTML previews ([240e2e8](https://github.com/Simon-He95/markstream-vue/commit/240e2e8cafd27e410bf8091c8860df75ed0e4ca9)), closes [#180](https://github.com/Simon-He95/markstream-vue/issues/180)
* add MermaidBlockNode and CodeBlockNode documentation in English and Chinese; remove outdated README files ([2c540e8](https://github.com/Simon-He95/markstream-vue/commit/2c540e8ee6918c03aac533dd4c465241ee52c828))
* add rollup-plugin-visualizer for bundle analysis; update dependencies and improve link parsing tests and fix the text following the link is missing. ([34a9331](https://github.com/Simon-He95/markstream-vue/commit/34a9331931a5919f782fe8a6276121e5bf086af0))
* add support for additional languages and themes in Monaco integration ([9953c6e](https://github.com/Simon-He95/markstream-vue/commit/9953c6ed886b7c7f95488f9e160f2b44bb0110f4))
* enhance documentation and performance features for incremental rendering and virtualization ([f734969](https://github.com/Simon-He95/markstream-vue/commit/f73496924affe3b540f006c12090c22cb3d79bdc))
* Enhance Mermaid integration and documentation ([0a1e746](https://github.com/Simon-He95/markstream-vue/commit/0a1e746da50a37d7e8276a2da3c6380c724855d6))
* support mhchem ([5d12f9b](https://github.com/Simon-He95/markstream-vue/commit/5d12f9ba16aa4e695fce3fe174e2469926a9ff91))
* **test:** enabling mermaid, enabling katex, renderMode ([4446f2c](https://github.com/Simon-He95/markstream-vue/commit/4446f2c79232f9822f7eed56bb0dbc92abea5915)), closes [#183](https://github.com/Simon-He95/markstream-vue/issues/183)
* update CHANGELOG for v0.0.2-beta.4; add CodeBlockNode and MermaidBlockNode components with documentation ([99c0f31](https://github.com/Simon-He95/markstream-vue/commit/99c0f31da154124ef20f663aa1cc1a57d2dc8f3d))
* update CHANGELOG for v0.0.2-beta.5; add footnote anchor component and rollup-plugin-visualizer ([2790a89](https://github.com/Simon-He95/markstream-vue/commit/2790a89d5569cbd86b5e7a0ccddf1424fc861edf))
* update markstream-vue dependency to latest version ([313ddfe](https://github.com/Simon-He95/markstream-vue/commit/313ddfe491a9071689c3d3a0f7c612b7529b2592))



## [0.0.63-beta.4](https://github.com/Simon-He95/markstream-vue/compare/v0.0.63-beta.3...v0.0.63-beta.4) (2025-11-25)


### Features

* add legacy builds documentation and improve regex compatibility for older iOS ([425ce44](https://github.com/Simon-He95/markstream-vue/commit/425ce44192343d17a9fd88c51d00dbc96763cee3)), closes [#162](https://github.com/Simon-He95/markstream-vue/issues/162)



## [0.0.63-beta.3](https://github.com/Simon-He95/markstream-vue/compare/v0.0.63-beta.2...v0.0.63-beta.3) (2025-11-25)


### Bug Fixes

* improve code formatting for better readability in parser API examples ([9c6ab1e](https://github.com/Simon-He95/markstream-vue/commit/9c6ab1ec71c45f423bea0bbce702f5a618b10a09))
* refine math parsing logic and improve test assertions for mid-state handling ([cd8a340](https://github.com/Simon-He95/markstream-vue/commit/cd8a34002854b5594c0a00561585bcbba39a2bf0))
* update InlineCodeNode styles for better responsiveness ([fa262f4](https://github.com/Simon-He95/markstream-vue/commit/fa262f40e00f475b9a43b95e088c725729144e7f))



## [0.0.63-beta.2](https://github.com/Simon-He95/markstream-vue/compare/v0.0.63-beta.0...v0.0.63-beta.2) (2025-11-25)


* feat(markdown)!: strict math delimiters, robust inline code parsing; drop plain parentheses as math ([8890aab](https://github.com/Simon-He95/markstream-vue/commit/8890aab22295431eda7a390f7ab1e6ffffb8da89))


### Bug Fixes

* **docs:** avoid dead-link build failure by using code span for localhost URL ([f50de00](https://github.com/Simon-He95/markstream-vue/commit/f50de00aa6f5048df1d33d58bdde4808c765005b))
* enhance code block rendering to support custom components for mermaid and code_block types ([e89d477](https://github.com/Simon-He95/markstream-vue/commit/e89d477ccad59bf91df3691f1ddc7071c80bd4b1))
* enhance streaming controls and improve content rendering performance ([ef3a3e3](https://github.com/Simon-He95/markstream-vue/commit/ef3a3e39d6e6d00eb4f66f47eb81635ababffbb4))
* ensure editor creation before updating code in CodeBlockNode ([b78c646](https://github.com/Simon-He95/markstream-vue/commit/b78c6462e8a4c90618c8fcded74790b2e65f2a7d))
* escape LaTeX syntax in markdown for proper rendering ([eb987d9](https://github.com/Simon-He95/markstream-vue/commit/eb987d949467cb02facff9a6c3cd61484e78a050))
* i18n in mermaid block ([30036be](https://github.com/Simon-He95/markstream-vue/commit/30036be77ed3e6b6087e99ba18712d99721dd52b))
* math formula in the Playground examples fixed ([2823a11](https://github.com/Simon-He95/markstream-vue/commit/2823a11cf4359aea435b94c7377ee3b88ed38828))
* nuxt build ([bbe1cba](https://github.com/Simon-He95/markstream-vue/commit/bbe1cba8d40c8752f1fc38d51f01d311ffdb8edc))
* remove default value for strictDelimiters in applyMath function ([b55a778](https://github.com/Simon-He95/markstream-vue/commit/b55a77838ddcd03f542b96e6444aa890c732eed0))
* render error ([e01b9ee](https://github.com/Simon-He95/markstream-vue/commit/e01b9ee6178f35cb30094dd4d1311543799bb248)), closes [#144](https://github.com/Simon-He95/markstream-vue/issues/144) [#151](https://github.com/Simon-He95/markstream-vue/issues/151) [#147](https://github.com/Simon-He95/markstream-vue/issues/147) [#143](https://github.com/Simon-He95/markstream-vue/issues/143)
* setCustomComponents not work ([120c5f5](https://github.com/Simon-He95/markstream-vue/commit/120c5f58da458fac3d33386d83470930ac6d534c))
* update dependencies in pnpm-lock.yaml and add markdown-it-ts ([dee3d70](https://github.com/Simon-He95/markstream-vue/commit/dee3d7011722bb98703ea64397bee793ec7fe56c))
* update node_version matrix to use lts/* for consistency ([fe4fd55](https://github.com/Simon-He95/markstream-vue/commit/fe4fd553cd37276429f69305411ad7d92723d273))
* update stream-markdown-parser to version 0.0.30 and enhance math-like detection logic ([a3fd3b5](https://github.com/Simon-He95/markstream-vue/commit/a3fd3b5dd2ae406be9c128f8262612003a2f1fcc))


### Features

* add @types/markdown-it-emoji to devDependencies ([35cf7de](https://github.com/Simon-He95/markstream-vue/commit/35cf7de08aedf53cd2beff1161e603f345b6dab0))
* add markdown-it-ts to acknowledgments in documentation ([6425f1a](https://github.com/Simon-He95/markstream-vue/commit/6425f1aac9f81ed4eca7f0f2425bb08efa4a0b28))
* add strict strong parsing option to inline token parser ([b8790bb](https://github.com/Simon-He95/markstream-vue/commit/b8790bb3564f5c4c9fb4d63a4e80f4d8fd7e4334))
* add support for markdown-it-emoji plugin and enhance documentation ([a6a7d1f](https://github.com/Simon-He95/markstream-vue/commit/a6a7d1f53d457942b4e764a158a79ca1145aec3e))
* add vitest setup for markdown-parser tests to reuse global mocks ([491f184](https://github.com/Simon-He95/markstream-vue/commit/491f1842ca11091347eb926f7343d1fe955fbb27))
* **parser:** robust backticks, literal markup in link labels, scoped link fallback, stricter math-like ([16e25ac](https://github.com/Simon-He95/markstream-vue/commit/16e25aca4e0d5b28c0f44b6f2c018b74e47fd398))


### BREAKING CHANGES

* plain ( ... ) is no longer treated as inline math. Use \(...\) or $...$ for inline formulas.



## [0.0.63-beta.0](https://github.com/Simon-He95/markstream-vue/compare/v0.0.62...v0.0.63-beta.0) (2025-11-20)


### Bug Fixes

* enhance math inline rendering for test environment and update snapshots ([0b82285](https://github.com/Simon-He95/markstream-vue/commit/0b822854b7bc737872b596583d409fd2e7269c2d))
* enhance math inline rendering for test environment and update snapshots ([ba29393](https://github.com/Simon-He95/markstream-vue/commit/ba2939392d36a800b121a41de3224b5ff7283e28))
* streamline dts-typecheck workflow and improve async component test environment checks ([da6f179](https://github.com/Simon-He95/markstream-vue/commit/da6f179d3c583d9e072d82ea2fb035a7bf50b7a3))
* streamline dts-typecheck workflow and improve async component test environment checks ([b7307bb](https://github.com/Simon-He95/markstream-vue/commit/b7307bb1dcd67385e054d4a0bfca8e9f981af04c))
* **strong-link-parser:** correctly parse strong links ([80a5298](https://github.com/Simon-He95/markstream-vue/commit/80a52989c3e15dd25efca06634c0d5c9a43c80d9))
* update vue-renderer-markdown to version 0.0.62 and remove deprecated stream-markdown-parser version ([7083852](https://github.com/Simon-He95/markstream-vue/commit/7083852ab859710e5bee9d23d80d028c2379cd7f))
* update vue-renderer-markdown to version 0.0.62 and remove deprecated stream-markdown-parser version ([2d00e1d](https://github.com/Simon-He95/markstream-vue/commit/2d00e1d97fc1d9cfcfce63612553dfde977590f0))


### Features

* centralize and export component prop interfaces for improved type safety and consistency ([f6ad138](https://github.com/Simon-He95/markstream-vue/commit/f6ad138563d7a8eb07ab4d1de0557988efa64c45))
* centralize and export component prop interfaces for improved type safety and consistency ([653803b](https://github.com/Simon-He95/markstream-vue/commit/653803be813ed8afe017573f129a1878a9b967bc))



## [0.0.62](https://github.com/Simon-He95/markstream-vue/compare/v0.0.62-beta.9...v0.0.62) (2025-11-20)


### Bug Fixes

* add tabindex and aria-label for accessibility in image node rendering ([8aabd3c](https://github.com/Simon-He95/markstream-vue/commit/8aabd3c2751113814dd0b74e52462659792871ea))
* **math:** inline mathBlock ([cb3509d](https://github.com/Simon-He95/markstream-vue/commit/cb3509d4cbd29c6bda875e8add8e3e0f0ae8eff8))
* optimize math formula handling and improve NodeRenderer dataset change detection ([08aae5c](https://github.com/Simon-He95/markstream-vue/commit/08aae5c6b837ad92d4f64fd4f16425a34a9ef673))
* update stream-markdown-parser to version 0.0.27 ([8cfcae9](https://github.com/Simon-He95/markstream-vue/commit/8cfcae9453e76f49a09f99108dc0909759400ce1))
* update stream-markdown-parser version to 0.0.26 in package.json and pnpm-lock.yaml ([44022f8](https://github.com/Simon-He95/markstream-vue/commit/44022f8cb5b8637ca79cc028a96af4dd85452595))


### Features

* add code block rendering documentation in English and Chinese ([2a57a3d](https://github.com/Simon-He95/markstream-vue/commit/2a57a3d9656c12368cf14d667a761fbdffbdf671))
* add documentation for ImageNode custom preview handling and props in English and Chinese ([5c2e833](https://github.com/Simon-He95/markstream-vue/commit/5c2e83320e65e58b110186c3026a7fc6bbfa5469)), closes [#140](https://github.com/Simon-He95/markstream-vue/issues/140)
* enhance ImageNode component to emit click event for image preview ([af1aebe](https://github.com/Simon-He95/markstream-vue/commit/af1aebe7920c6c8d1496d78d5cf58cdba1d980e9))



## [0.0.62-beta.9](https://github.com/Simon-He95/markstream-vue/compare/v0.0.62-beta.8...v0.0.62-beta.9) (2025-11-19)



## [0.0.62-beta.8](https://github.com/Simon-He95/markstream-vue/compare/v0.0.62-beta.7...v0.0.62-beta.8) (2025-11-19)


### Bug Fixes

* improve link parsing and handling of emphasis in markdown ([ec7a314](https://github.com/Simon-He95/markstream-vue/commit/ec7a3141a38e7dd668261c42d5333d43f0182b05))


### Features

* enhance mermaid availability handling and user interface interactions ([2519dde](https://github.com/Simon-He95/markstream-vue/commit/2519dde1a7db89732525daa33b1f3157a64601ff))



## [0.0.62-beta.7](https://github.com/Simon-He95/markstream-vue/compare/v0.0.62-beta.6...v0.0.62-beta.7) (2025-11-19)


### Bug Fixes

* docs github workflow ([401add4](https://github.com/Simon-He95/markstream-vue/commit/401add425705bbd4917d46a6a46059e8ff591b8c))


### Features

* add TypeScript declaration checks and improve module imports ([86f4ecc](https://github.com/Simon-He95/markstream-vue/commit/86f4ecc504e1dd53010d863608ed307338f3fbb6))



## [0.0.62-beta.6](https://github.com/Simon-He95/markstream-vue/compare/v0.0.62-beta.5...v0.0.62-beta.6) (2025-11-18)


### Bug Fixes

* enhance inline parsing for URLs and improve test coverage for trailing text handling ([6f21c09](https://github.com/Simon-He95/markstream-vue/commit/6f21c09cb0911816a25652ae7b2c932e1ac5e575))
* improve inline token parsing and enhance link parsing tests for better handling of edge cases ([42b6d13](https://github.com/Simon-He95/markstream-vue/commit/42b6d13d07ab20930a21ded1fbf1a97809805dae))
* update stream-markdown-parser to version 0.0.25 ([fc16f7d](https://github.com/Simon-He95/markstream-vue/commit/fc16f7d2f1341f33b775f2c7cdad68653e477208))



## [0.0.62-beta.5](https://github.com/Simon-He95/markstream-vue/compare/v0.0.62-beta.4...v0.0.62-beta.5) (2025-11-18)


### Bug Fixes

* update stream-markdown-parser to version 0.0.23 and enhance HTML token handling ([d831a3f](https://github.com/Simon-He95/markstream-vue/commit/d831a3ff9178814aff4a0b96b80cb27acfd8b63d))
* update version to 0.0.24 and enhance table cell alignment handling ([c859da1](https://github.com/Simon-He95/markstream-vue/commit/c859da1b00a1d0a44cf8921111e7c8c03f546f54)), closes [#127](https://github.com/Simon-He95/markstream-vue/issues/127)



## [0.0.62-beta.4](https://github.com/Simon-He95/markstream-vue/compare/v0.0.62-beta.3...v0.0.62-beta.4) (2025-11-18)


### Bug Fixes

* change pnpm installation step to use npm instead of action ([791424f](https://github.com/Simon-He95/markstream-vue/commit/791424fd4461ed8f4bb66a71ce81a208fee53fa7))
* enhance HTML token handling and add tests for link parsing with parentheses ([5904b9e](https://github.com/Simon-He95/markstream-vue/commit/5904b9e0d231405583d208447f93bcbda8e66251))
* improve link token handling and update link node styles ([761bbab](https://github.com/Simon-He95/markstream-vue/commit/761bbab5a5d718911e183d24dab1d425cd4b87a8))
* update dependencies to latest versions for improved stability ([302dc92](https://github.com/Simon-He95/markstream-vue/commit/302dc92368eae13cd1ca11cda00381f3e8d60381))
* update documentation links to use HTTPS ([c0cc5be](https://github.com/Simon-He95/markstream-vue/commit/c0cc5befb7a221854320f4d6761c207bf0e74f42))
* update Node.js version to 20 and use pnpm action for installation ([23b8606](https://github.com/Simon-He95/markstream-vue/commit/23b8606bd3b1d411c9fb8790f23e02f67108fb7d))



## [0.0.62-beta.3](https://github.com/Simon-He95/markstream-vue/compare/v0.0.62-beta.2...v0.0.62-beta.3) (2025-11-17)


### Bug Fixes

* correct indentation for pnpm action setup in docs parity workflow ([c1925b9](https://github.com/Simon-He95/markstream-vue/commit/c1925b9d663cff1df02ebb65cc8a165ad0b68e3a))
* correct indentation for pnpm installation step in docs parity workflow ([98a61cd](https://github.com/Simon-He95/markstream-vue/commit/98a61cd26178edb353247775950bd17758c2af38))
* intermediate state of link with emphasis ([ac02c11](https://github.com/Simon-He95/markstream-vue/commit/ac02c11cd81ae2cf90aed633aa26841b0e32ae37)), closes [#134](https://github.com/Simon-He95/markstream-vue/issues/134)
* update stream-markdown-parser version to 0.0.21 in package.json and pnpm-lock.yaml ([46f81fe](https://github.com/Simon-He95/markstream-vue/commit/46f81fec00a15e1082379c7e827be8645d310c4c))


### Features

* add scripts to check and sync Chinese documentation placeholders ([4523999](https://github.com/Simon-He95/markstream-vue/commit/45239995a569b5efd78aeb24f2f126ae7ef521ca)), closes [#121](https://github.com/Simon-He95/markstream-vue/issues/121)
* refactor pnpm setup steps in workflows for clarity ([67d90a7](https://github.com/Simon-He95/markstream-vue/commit/67d90a73a66dcf162ae2ba0eb209b56780f06981))
* reorder pnpm installation step for improved workflow clarity ([9758aba](https://github.com/Simon-He95/markstream-vue/commit/9758aba1dc4438398e897bc0a4b04014eb32c616))
* replace pnpm setup script with action in workflow files for consistency ([38dfb32](https://github.com/Simon-He95/markstream-vue/commit/38dfb32a291ba89e81276545bb84f6d0a5d09251))
* update Chinese README and documentation ([8bc4d00](https://github.com/Simon-He95/markstream-vue/commit/8bc4d0046bf8b71df3e374192bc52fbbc56b34ab))
* update Netlify deployment configuration and add build scripts for documentation ([4618897](https://github.com/Simon-He95/markstream-vue/commit/461889709a4a4b06d0ff800ac5d1486cb88896af))
* update pnpm setup steps for consistency across workflows ([24bff32](https://github.com/Simon-He95/markstream-vue/commit/24bff32a5a8cebb88fe69602a05c724d6f9605c0))



## [0.0.62-beta.2](https://github.com/Simon-He95/markstream-vue/compare/v0.0.62-beta.1...v0.0.62-beta.2) (2025-11-14)


### Bug Fixes

* **strong-link:** parse wrong ([137842b](https://github.com/Simon-He95/markstream-vue/commit/137842bf53121bc3b371e0057deda5485c9fc8b5))



## [0.0.62-beta.1](https://github.com/Simon-He95/markstream-vue/compare/v0.0.62-beta.0...v0.0.62-beta.1) (2025-11-13)


### Bug Fixes

* adjust indentation for NodeRenderer components in multiple nodes ([c2cd3ac](https://github.com/Simon-He95/markstream-vue/commit/c2cd3ac3ef5dcc9a629630742b709a7edd9c8ce5))
* missing typewriter property passing ([a02229c](https://github.com/Simon-He95/markstream-vue/commit/a02229c6c6b494ab42d54a0d9af1546940c8689d))



## [0.0.62-beta.0](https://github.com/Simon-He95/markstream-vue/compare/v0.0.61-beta.9...v0.0.62-beta.0) (2025-11-12)


### Bug Fixes

* improve layout and overflow handling in test.vue for better user experience ([005f844](https://github.com/Simon-He95/markstream-vue/commit/005f8444d4cc12be761fbf364e36ecbcbfe86df8))
* remove commented-out tooltip code in README.md for cleaner documentation ([3f17f09](https://github.com/Simon-He95/markstream-vue/commit/3f17f094b4c0eab52ae0381658586f94aa57adaf))


### Features

* add typewriter prop to NodeRenderer for controlling enter transition ([a9a8b06](https://github.com/Simon-He95/markstream-vue/commit/a9a8b064050821cfe21c4436f447d72748e75b86))



## [0.0.61-beta.9](https://github.com/Simon-He95/markstream-vue/compare/v0.0.61-beta.8...v0.0.61-beta.9) (2025-11-10)


### Bug Fixes

* update stream-markdown-parser and markdown-it-ts dependencies to latest versions ([48319d8](https://github.com/Simon-He95/markstream-vue/commit/48319d8e006276f0ba360bb2c14b11380da85282))


### Features

* add attrs property to HtmlBlockNode and update HtmlBlockNode component to bind attributes ([4501016](https://github.com/Simon-He95/markstream-vue/commit/45010165e94d0bb66b259828f1fde80b790f17ea)), closes [#116](https://github.com/Simon-He95/markstream-vue/issues/116)
* implement HTML block and inline token fixes with corresponding tests ([0e94ec2](https://github.com/Simon-He95/markstream-vue/commit/0e94ec24cea099d319af6fe310992e4e7d811073))



## [0.0.61-beta.8](https://github.com/Simon-He95/markstream-vue/compare/v0.0.61-beta.7...v0.0.61-beta.8) (2025-11-05)


### Bug Fixes

* handle errors during KaTeX rendering in MathBlockNode and MathInlineNode components ([6b5b2db](https://github.com/Simon-He95/markstream-vue/commit/6b5b2dbc5c04a1c7c14fa1b6be97eccca9a455fd))
* improve share link generation by choosing shorter representation and add tests for payload handling ([840f871](https://github.com/Simon-He95/markstream-vue/commit/840f871e5d0c10bdbf1d32ef3fd4b6913ff7d6ce))
* remove unnecessary is-dark attributes from admonition and table node wrappers ([5b0ebef](https://github.com/Simon-He95/markstream-vue/commit/5b0ebef43a03c3b2bc68ce983608758445417077))
* update markdown-it-ts dependency to version 0.0.2-beta.2 ([05db9af](https://github.com/Simon-He95/markstream-vue/commit/05db9af487c96ba00d6fa6065bcdbc1e0223b11e))
* update stream-markdown-parser dependency to version 0.0.15 ([ccb3142](https://github.com/Simon-He95/markstream-vue/commit/ccb3142e7bfcd744b3ab6bf976f17d3bd8b7624d))


### Features

* add dark mode support to tooltip and various components with isDark prop ([37fb15e](https://github.com/Simon-He95/markstream-vue/commit/37fb15ebe7b9c1687da81ab6ac99dde8d59cc596))
* add HtmlBlockNode component and parser for HTML block support ([ee9e4ee](https://github.com/Simon-He95/markstream-vue/commit/ee9e4ee168bbff1132a0452a4a6b4967e0f989c4))
* add streaming rendering feature with adjustable speed and interval settings ([70c5534](https://github.com/Simon-He95/markstream-vue/commit/70c55348154c47843169e046933ef898b39de240))
* migrate to markdown-it-ts for improved TypeScript support and enhanced token handling ([296cbdc](https://github.com/Simon-He95/markstream-vue/commit/296cbdc4092170301b4b6e4b3048a460202f9f2a)), closes [#106](https://github.com/Simon-He95/markstream-vue/issues/106)



## [0.0.61-beta.7](https://github.com/Simon-He95/markstream-vue/compare/v0.0.61-beta.6...v0.0.61-beta.7) (2025-11-02)


### Bug Fixes

* update stream-markdown-parser to version 0.0.14 and add inline HTML parsing support ([281f538](https://github.com/Simon-He95/markstream-vue/commit/281f538e814bfdbd3c586c2c5192aa16ef7d4c04))



## [0.0.61-beta.6](https://github.com/Simon-He95/markstream-vue/compare/v0.0.61-beta.5...v0.0.61-beta.6) (2025-11-01)


### Bug Fixes

* remove unnecessary class from preview container in test page ([ed15dcb](https://github.com/Simon-He95/markstream-vue/commit/ed15dcbd2f82947f3b4dcc9374e3e5ceee7e99d2))
* update stream-markdown-parser to version 0.0.13 and enhance autolink detection with new tests ([1349611](https://github.com/Simon-He95/markstream-vue/commit/13496113e7a2235d9b36a3168af42de2981876dd))



## [0.0.61-beta.5](https://github.com/Simon-He95/markstream-vue/compare/v0.0.61-beta.4...v0.0.61-beta.5) (2025-10-31)


### Bug Fixes

* remove unused function for building issue URL from link ([59d5a19](https://github.com/Simon-He95/markstream-vue/commit/59d5a19d1883764af3d520932666efc5c50966c4))
* update stream-markdown-parser version to 0.0.12 and improve list item rendering styles ([c05df9a](https://github.com/Simon-He95/markstream-vue/commit/c05df9a6a4169416ce10a3515955e3641bc1daee))


### Features

* add navigation to test page and improve issue link generation in test component ([cf66c3b](https://github.com/Simon-He95/markstream-vue/commit/cf66c3b7e5378c98568445b1322502bad2fa8b81))



## [0.0.61-beta.4](https://github.com/Simon-He95/markstream-vue/compare/v0.0.61-beta.3...v0.0.61-beta.4) (2025-10-31)


### Bug Fixes

* update import path for markdown parser in NodeRenderer component ([e4757b6](https://github.com/Simon-He95/markstream-vue/commit/e4757b6ecc0eaacaf915aa61ec83349187874297))



## [0.0.61-beta.3](https://github.com/Simon-He95/markstream-vue/compare/v0.0.61-beta.2...v0.0.61-beta.3) (2025-10-31)


### Features

* add Markdown input and live preview component ([d19fe9b](https://github.com/Simon-He95/markstream-vue/commit/d19fe9b4a2cfab1b4c7c5598a0e79d65ac52e29f))
* update math parsing and rendering capabilities, enhance bug report template, and improve share link functionality ([11ce18b](https://github.com/Simon-He95/markstream-vue/commit/11ce18bd4f4c6daeebbb393c15dbc52c39a9b4f2))



## [0.0.61-beta.2](https://github.com/Simon-He95/markstream-vue/compare/v0.0.61-beta.1...v0.0.61-beta.2) (2025-10-30)



## [0.0.61-beta.1](https://github.com/Simon-He95/markstream-vue/compare/v0.0.61-beta.0...v0.0.61-beta.1) (2025-10-29)


### Features

* **link-node:** add tooltip support and aria-label for accessibility ([4dea770](https://github.com/Simon-He95/markstream-vue/commit/4dea77086e82108a27a59a66ed01f5051873a9ca))
* **markdown-parser:** implement link and list item normalization plugins; update version to 0.0.9 ([8423a86](https://github.com/Simon-He95/markstream-vue/commit/8423a86509d7697f16555424a989102864c9b00b))



## [0.0.61-beta.0](https://github.com/Simon-He95/markstream-vue/compare/v0.0.60-beta.5...v0.0.61-beta.0) (2025-10-27)


### Bug Fixes

* complex inline_code with strong ([11e7406](https://github.com/Simon-He95/markstream-vue/commit/11e74061405a9285f97961390eaf752c93562372))
* improve error handling in parse probes and midstate utilities ([af36aed](https://github.com/Simon-He95/markstream-vue/commit/af36aedb88d2bd41ed080e085678ae032244eae0))
* **inline-parsers:**  checkbox_input ([2bf674d](https://github.com/Simon-He95/markstream-vue/commit/2bf674de57dd24b13e3b3f8a24c0505ba1d98326))
* **list_item:** The text inside the element is not centered ([14d39b4](https://github.com/Simon-He95/markstream-vue/commit/14d39b4ab09173a4cc04f724d56c52a602cf0c72))
* **list:** prevent unintended li value attribute ([b00ea58](https://github.com/Simon-He95/markstream-vue/commit/b00ea58f516710d1be834053c1f169b3e6a2c500))


### Features

* add codeBlockStream prop for controlling streaming behavior of code blocks ([3ac4629](https://github.com/Simon-He95/markstream-vue/commit/3ac4629419f095e7588308bdb1c4fda882aed47e))



## [0.0.60-beta.5](https://github.com/Simon-He95/markstream-vue/compare/v0.0.60-beta.4...v0.0.60-beta.5) (2025-10-24)


### Bug Fixes

* dep required shiki ([136a065](https://github.com/Simon-He95/markstream-vue/commit/136a0659b029e16512de11414f6d374f36e914f8)), closes [#97](https://github.com/Simon-He95/markstream-vue/issues/97) [#98](https://github.com/Simon-He95/markstream-vue/issues/98)



## [0.0.60-beta.4](https://github.com/Simon-He95/markstream-vue/compare/v0.0.60-beta.3...v0.0.60-beta.4) (2025-10-24)


### Bug Fixes

* enhance link token parsing and update related tests ([5f1ce31](https://github.com/Simon-He95/markstream-vue/commit/5f1ce3198a0f13957b72f2233d992fbce769a794))
* update stream-markdown-parser to version 0.0.6 ([29ca069](https://github.com/Simon-He95/markstream-vue/commit/29ca06908c75e75b382b2f293a167d403c50d294))



## [0.0.60-beta.3](https://github.com/Simon-He95/markstream-vue/compare/v0.0.60-beta.2...v0.0.60-beta.3) (2025-10-24)


### Bug Fixes

* improve link handling in parseInlineTokens function ([c1486f5](https://github.com/Simon-He95/markstream-vue/commit/c1486f58d8b9780bf5844c4bcd920b110ac27767))
* update stream-markdown-parser dependency to version 0.0.5 ([4ecf899](https://github.com/Simon-He95/markstream-vue/commit/4ecf89990090336f5ca86d23d28948e344f85474))



## [0.0.60-beta.2](https://github.com/Simon-He95/markstream-vue/compare/v0.0.60-beta.1...v0.0.60-beta.2) (2025-10-24)


### Bug Fixes

* enhance reference token handling in parseInlineTokens function ([2511a32](https://github.com/Simon-He95/markstream-vue/commit/2511a32829cc9adb038deb40ea72190e535f1af6))
* update stream-markdown dependency to version 0.0.5 and remove unused language prop in MarkdownCodeBlockNode ([952cac2](https://github.com/Simon-He95/markstream-vue/commit/952cac2cd26edf34e4c630b4b4ea31ee696e04ad))



## [0.0.60-beta.1](https://github.com/Simon-He95/markstream-vue/compare/v0.0.60-beta.0...v0.0.60-beta.1) (2025-10-23)


### Bug Fixes

* add author link to markdown content ([d8d0a50](https://github.com/Simon-He95/markstream-vue/commit/d8d0a5055294c6d91b3102e480b2df0dd6a1c001))
* update version to 0.0.4 and refine regex in fixListItem function ([a9a88fe](https://github.com/Simon-He95/markstream-vue/commit/a9a88fe9babe1c4d38f2f0787f6adf8060fc9c4e))



## [0.0.60-beta.0](https://github.com/Simon-He95/markstream-vue/compare/v0.0.59...v0.0.60-beta.0) (2025-10-23)


### Bug Fixes

* enhance link parsing and improve inline token handling in markdown parser ([2ee6be7](https://github.com/Simon-He95/markstream-vue/commit/2ee6be7c33050e6d808de6a40d98484a6d64cfc3))
* reorder imports in NodeRenderer component for consistency ([b74bf05](https://github.com/Simon-He95/markstream-vue/commit/b74bf05720e9fd1d4ecb14685e86085f88234762))
* restore monaco-editor dependency and improve loading state handling in MathInlineNode ([955578c](https://github.com/Simon-He95/markstream-vue/commit/955578c74a02694044b95c9b44796e4d54834507))
* update stream-markdown-parser dependency to version 0.0.3 and adjust imports in NodeRenderer component ([08f0abb](https://github.com/Simon-He95/markstream-vue/commit/08f0abb32aa4292e7c3edb0c7cc458930523a51f))
* update vite dependency to version 7.1.12 in package.json files ([5e507ab](https://github.com/Simon-He95/markstream-vue/commit/5e507ab19d413816bf4fdd945f8d053f96e2d0b4))



## [0.0.59](https://github.com/Simon-He95/markstream-vue/compare/v0.0.58-beta.7...v0.0.59) (2025-10-22)


### Bug Fixes

* add null checks for optional properties in markdown parser functions ([3b8eb0a](https://github.com/Simon-He95/markstream-vue/commit/3b8eb0a10418cf837dc00268448bb35629c7c99a))
* comment out example code for MarkdownIt with custom math options ([3dfd856](https://github.com/Simon-He95/markstream-vue/commit/3dfd856f271e8eb90799e06f55e3df699129d2ae))
* **parser:** add validation for link tokens to prevent malformed links ([1c1bb33](https://github.com/Simon-He95/markstream-vue/commit/1c1bb33a9141e8406d05e3fcab4909ef12f417de))
* restore monaco-editor dependency in package.json and pnpm-lock.yaml ([888791d](https://github.com/Simon-He95/markstream-vue/commit/888791dfca10484c6a685c7cd71c0cead151b13f))
* **tableNode:** adjust class order for table node to improve styling ([faa9f3c](https://github.com/Simon-He95/markstream-vue/commit/faa9f3c51e6ac3fb9b5284d4b9712a51a577ca5d))
* **tableNode:** lint ([6cb3830](https://github.com/Simon-He95/markstream-vue/commit/6cb38306628aaf70cfaf920182583691f98547b9))
* **tableNode:** remove body td pl-0 ([7996da2](https://github.com/Simon-He95/markstream-vue/commit/7996da2fcb4d0f2cea6338e97280b218033a813c))
* update import path for getMarkdown to use stream-markdown-parser ([5358b8e](https://github.com/Simon-He95/markstream-vue/commit/5358b8e5a242e18107596d651c8fb247e449f92e))
* update stream-markdown-parser dependency to specific version in package.json and pnpm-lock.yaml ([4c51c9a](https://github.com/Simon-He95/markstream-vue/commit/4c51c9af4bde2e6d12b04d7157f09e058af5d649))
* update version and main entry point in package.json ([a5dc3c2](https://github.com/Simon-He95/markstream-vue/commit/a5dc3c225a70c42fd49f4a47534eb189d5d12353))
* update Vite configuration and TypeScript settings for improved type handling and asset resolution ([b516d12](https://github.com/Simon-He95/markstream-vue/commit/b516d12376f7ebd1535ad556c273926a12444b81))


### Features

* add stream-markdown dependency and update documentation for MarkdownCodeBlockNode usage ([c9bcb4a](https://github.com/Simon-He95/markstream-vue/commit/c9bcb4a7d166a310cc7d788886c39ba044edace2))
* implement factory function for MarkdownIt with math and container support ([3e0a894](https://github.com/Simon-He95/markstream-vue/commit/3e0a894d58c1925e9bd31af784c1b2adda493bcd))
* **tableNode:** remove useless pl-0 ([8d1237f](https://github.com/Simon-He95/markstream-vue/commit/8d1237f1a5e6b6c2a1e1ec7872c6e693dcda132d))
* update pnpm workspace and refactor imports for stream-markdown-parser ([c860400](https://github.com/Simon-He95/markstream-vue/commit/c86040065d47e29470c883cb07cb75e10aa154d3))



## [0.0.58-beta.7](https://github.com/Simon-He95/markstream-vue/compare/v0.0.58-beta.6...v0.0.58-beta.7) (2025-10-21)


### Features

* export CodeBlockNode monaco component for improved integration ([9126c84](https://github.com/Simon-He95/markstream-vue/commit/9126c84c5b5b77ea4a0a4ed69f4307e3bfef2d57))



## [0.0.58-beta.6](https://github.com/Simon-He95/markstream-vue/compare/v0.0.58-beta.5...v0.0.58-beta.6) (2025-10-21)


### Features

* implement link token parsing and enhance inline token processing ([72344ee](https://github.com/Simon-He95/markstream-vue/commit/72344ee93066bbae1580be241f82d6b1064135b1))
* replace vue-use-monaco with stream-monaco for Monaco Editor integration ([b87d1bf](https://github.com/Simon-He95/markstream-vue/commit/b87d1bf9116324ff174f2c58ee8fc2f8b94c8649))



## [0.0.58-beta.5](https://github.com/Simon-He95/markstream-vue/compare/v0.0.58-beta.4...v0.0.58-beta.5) (2025-10-21)


### Bug Fixes

* improve loading state handling in MathInlineNode rendering ([06312c5](https://github.com/Simon-He95/markstream-vue/commit/06312c55435c935cdb55a28c7cf41cdd3f61b052))


### Features

* add loading state management to MathBlockNode and MathInlineNode for improved rendering feedback ([012cbb9](https://github.com/Simon-He95/markstream-vue/commit/012cbb989d33f5785c1a2f709a5c11c8884ca9ac))
* enhance MathBlockNode and MathInlineNode for improved loading state and worker management ([62197f3](https://github.com/Simon-He95/markstream-vue/commit/62197f37f65deab5eb409989ba4e440c89fd3c28))



## [0.0.58-beta.4](https://github.com/Simon-He95/markstream-vue/compare/v0.0.58-beta.3...v0.0.58-beta.4) (2025-10-20)


### Features

* add configurable timeouts for parsing and rendering in MermaidBlockNode and improve error handling in worker calls ([d42ea75](https://github.com/Simon-He95/markstream-vue/commit/d42ea75f98a201bb918ef599f49b3381fa0c8968))
* add viewportPriority prop to optimize rendering for offscreen nodes in Markdown rendering ([681bdcb](https://github.com/Simon-He95/markstream-vue/commit/681bdcb3e478d0d6ed55447f9e387cdb010ed6e9))
* enhance MathBlockNode and MathInlineNode to handle busy worker fallback and improve rendering logic ([14d3a95](https://github.com/Simon-He95/markstream-vue/commit/14d3a95a6eae7757bdb308efef2bca18cf2d8f4d))



## [0.0.58-beta.3](https://github.com/Simon-He95/markstream-vue/compare/v0.0.58-beta.2...v0.0.58-beta.3) (2025-10-20)


### Bug Fixes

* update regex for loading state detection to correctly match href in parentheses ([0f9b048](https://github.com/Simon-He95/markstream-vue/commit/0f9b048df3e91ce9a83b0864fcbd8dac97512564))


### Features

* implement viewport priority rendering for MathBlockNode and MathInlineNode components ([d32f78a](https://github.com/Simon-He95/markstream-vue/commit/d32f78acc49bb4f360a0ab363201e95207bc068a))
* integrate viewport priority handling in MathBlockNode and MathInlineNode components ([10e6fa3](https://github.com/Simon-He95/markstream-vue/commit/10e6fa33aeac9b8d111dc3743eea93ec08603d38))



## [0.0.58-beta.2](https://github.com/Simon-He95/markstream-vue/compare/v0.0.58-beta.1...v0.0.58-beta.2) (2025-10-20)


### Bug Fixes

* disable content-visibility for NodeRenderer in various components to prevent empty placeholders during large document scrolling ([4b28e34](https://github.com/Simon-He95/markstream-vue/commit/4b28e34eade77ced1fcc7b0db9ecc2f1c873155f))



## [0.0.58-beta.1](https://github.com/Simon-He95/markstream-vue/compare/v0.0.58-beta.0...v0.0.58-beta.1) (2025-10-20)



## [0.0.58-beta.0](https://github.com/Simon-He95/markstream-vue/compare/v0.0.57...v0.0.58-beta.0) (2025-10-20)



## [0.0.57](https://github.com/Simon-He95/markstream-vue/compare/v0.0.57-beta.6...v0.0.57) (2025-10-20)



## [0.0.57-beta.6](https://github.com/Simon-He95/markstream-vue/compare/v0.0.57-beta.5...v0.0.57-beta.6) (2025-10-20)


### Features

* enhance SSR support and worker integration, update Vite config to use Terser for minification ([1d4861e](https://github.com/Simon-He95/markstream-vue/commit/1d4861ea23f2433bf17b3ab46cce2f5753321fdf))



## [0.0.57-beta.5](https://github.com/Simon-He95/markstream-vue/compare/v0.0.57-beta.4...v0.0.57-beta.5) (2025-10-20)



## [0.0.57-beta.4](https://github.com/Simon-He95/markstream-vue/compare/v0.0.57-beta.3...v0.0.57-beta.4) (2025-10-20)


### Features

* add build and validation workflow for distribution files, including worker scripts ([47ed3b9](https://github.com/Simon-He95/markstream-vue/commit/47ed3b91eb759bc87a25a027a50c5d1a4d35f733))


### Performance Improvements

* preload monaco request ([7edc402](https://github.com/Simon-He95/markstream-vue/commit/7edc402a0279fd85e57411765dd4a5937067deb9))



## [0.0.57-beta.3](https://github.com/Simon-He95/markstream-vue/compare/v0.0.57-beta.2...v0.0.57-beta.3) (2025-10-19)


### Bug Fixes

* prevent scroll jump when Monaco editor loads above viewport ([0b29b5a](https://github.com/Simon-He95/markstream-vue/commit/0b29b5a3d8242f0c8236ac25bff2c7589e913f89))
* update vue-renderer-markdown version and @types/node dependency in package.json and pnpm-lock.yaml ([803daf0](https://github.com/Simon-He95/markstream-vue/commit/803daf08de45907f29105eaa40c91ed1200afaac))


### Features

* add custom parse hooks and parseOptions prop for enhanced markdown processing ([4b7ba40](https://github.com/Simon-He95/markstream-vue/commit/4b7ba40111e5e207522a0aa42f4a438fee09ad1b))
* enhance ThinkingNode component with loading state and decorative icon ([16254ef](https://github.com/Simon-He95/markstream-vue/commit/16254ef675487f4f035362d0f3a1ebf4c5f77e93))



## [0.0.57-beta.2](https://github.com/Simon-He95/markstream-vue/compare/v0.0.57-beta.1...v0.0.57-beta.2) (2025-10-17)


### Bug Fixes

* only match double tildes for strikethrough syntax ([e54464b](https://github.com/Simon-He95/markstream-vue/commit/e54464b338d5821be5f671fea08f25edd88c2688))


### Features

* implement isMathLike function for improved math detection and refactor related tests ([2aa4ab0](https://github.com/Simon-He95/markstream-vue/commit/2aa4ab03fdfcbc1aea3329e5d110bcfd27ea6a0d))
* update KaTeX integration and improve math rendering ([103e703](https://github.com/Simon-He95/markstream-vue/commit/103e70310ddb6db65e961938babbd413a9b67518))



## [0.0.57-beta.1](https://github.com/Simon-He95/markstream-vue/compare/v0.0.57-beta.0...v0.0.57-beta.1) (2025-10-16)


### Bug Fixes

* format onMounted function for better readability in README files ([c1b5a2a](https://github.com/Simon-He95/markstream-vue/commit/c1b5a2a7171c534af242a8de0a8be70ef6764002))


### Features

* add chunk size control for streaming content preview ([e1d459b](https://github.com/Simon-He95/markstream-vue/commit/e1d459b6455a02f323c72dd8016a44f95d7c2638))
* add markdown streaming component with theme selection and auto-scroll functionality ([c91bbf5](https://github.com/Simon-He95/markstream-vue/commit/c91bbf54211d7f5c7d9ea794760431d37c01a47b))
* add raw property to MarkdownToken and enhance math inline parsing ([b05ca32](https://github.com/Simon-He95/markstream-vue/commit/b05ca32cab9f1f12c7d0df8cdb3e43203adb37b5))
* add stream delay control for improved content streaming experience ([9ce73ac](https://github.com/Simon-He95/markstream-vue/commit/9ce73acfb6e515f87ae3ec2bcaffc06a2c4203d1))
* add support for checkbox inputs in lists and enhance inline token parsing ([61d18a6](https://github.com/Simon-He95/markstream-vue/commit/61d18a6a675ac7d820fc94137b9328ae59aecbab)), closes [#76](https://github.com/Simon-He95/markstream-vue/issues/76)
* enhance auto-scroll functionality with frame-based scrolling and immediate updates ([8a1783a](https://github.com/Simon-He95/markstream-vue/commit/8a1783a099503a55f18336db1add652b9ada238d))
* **i18n:** add fallback translation support and update documentation ([d8e6a5f](https://github.com/Simon-He95/markstream-vue/commit/d8e6a5fc61580a17ce905dfead06838becc8070c)), closes [#74](https://github.com/Simon-He95/markstream-vue/issues/74)
* replace refs with useLocalStorage for stream settings and theme selection ([b3c8be6](https://github.com/Simon-He95/markstream-vue/commit/b3c8be6fc5426c2d20939d8a25daee7488c4b949))



## [0.0.57-beta.0](https://github.com/Simon-He95/markstream-vue/compare/v0.0.56-beta.8...v0.0.57-beta.0) (2025-10-15)


### Bug Fixes

* **markdown-parser:** enhance table parsing to support additional edge cases ([2d446f5](https://github.com/Simon-He95/markstream-vue/commit/2d446f5aac41c5289e51b0a818992d26f201cf79))


### Features

* **App.vue:** add ResizeObserver for dynamic content height detection and auto-scroll management ([22a536f](https://github.com/Simon-He95/markstream-vue/commit/22a536ff7163d664c246a81a5f3dde4e17c5e0a2))
* **markdown-parser:** implement table token fixing and strong token handling ([af08dd4](https://github.com/Simon-He95/markstream-vue/commit/af08dd4cb5ccee8faa41420b8f8c612739dad172))
* **TableNode:** add loading slot and loading state support for table rendering ([8a309a0](https://github.com/Simon-He95/markstream-vue/commit/8a309a0f1164217ec7e72d2d037275f6d6ba5da6))
* **TableNode:** enhance table rendering with loading state and improved structure ([2413509](https://github.com/Simon-He95/markstream-vue/commit/241350954a385ae53a5a76ec61581aec034aaa75))



## [0.0.56-beta.8](https://github.com/Simon-He95/markstream-vue/compare/v0.0.56-beta.7...v0.0.56-beta.8) (2025-10-14)


### Bug Fixes

* **App.vue:** adjust app container height for better layout consistency ([9a5dccb](https://github.com/Simon-He95/markstream-vue/commit/9a5dccb5186d6c580f1ff71bdc5984b96aecc7af))
* **math-plugin:** correct inline content parsing and snapshot for Chinese text ([1285980](https://github.com/Simon-He95/markstream-vue/commit/1285980651d285ae6428d8ebfd70b8f49f746a99))
* **tests:** update e2e tests for MarkdownRender and improve snapshot handling ([46ae70e](https://github.com/Simon-He95/markstream-vue/commit/46ae70e1743b5b2587ac8805f4d496421bd384cf))


### Features

* **App.vue:** implement IntersectionObserver for improved auto-scroll detection on mobile ([5fa6f36](https://github.com/Simon-He95/markstream-vue/commit/5fa6f36f2b2c3373b1bfa54b0ca8fb9b8c72c126))
* **markdown:** add center prop to TextNode for improved alignment handling ([41adbff](https://github.com/Simon-He95/markstream-vue/commit/41adbff131a6aa9da71b14771b6fb3cc7a8bc4b1))
* **markdown:** add handling for inline code tokens in parseInlineTokens function ([1d4f00c](https://github.com/Simon-He95/markstream-vue/commit/1d4f00cfdaca368ffda78e4c1de3f91055dd0e60))



## [0.0.56-beta.7](https://github.com/Simon-He95/markstream-vue/compare/v0.0.56-beta.6...v0.0.56-beta.7) (2025-10-13)


### Features

* add indexKey prop to various node components for improved rendering and identification ([4581b60](https://github.com/Simon-He95/markstream-vue/commit/4581b60e41bf09206147aa5a29d8dc12e72f5224))



## [0.0.56-beta.6](https://github.com/Simon-He95/markstream-vue/compare/v0.0.56-beta.5...v0.0.56-beta.6) (2025-10-13)


### Bug Fixes

* **math:** prevent processing of empty pending state in applyMath function ([08c28c8](https://github.com/Simon-He95/markstream-vue/commit/08c28c82d067d44c3c5a11b5b041aaaed8255532))


### Features

* **markdown:** enhance emoji and inline parsing, improve token handling and structure ([e2489a1](https://github.com/Simon-He95/markstream-vue/commit/e2489a168c8919ae1781714216f002a0f1df972b))


### Performance Improvements

* **markdown:** improve inline emphasis token handling and text node merging ([2b64ae8](https://github.com/Simon-He95/markstream-vue/commit/2b64ae816cff3b7ba20b129d00c2ab5ba5251b69))



## [0.0.56-beta.5](https://github.com/Simon-He95/markstream-vue/compare/v0.0.56-beta.4...v0.0.56-beta.5) (2025-10-12)


### Bug Fixes

* chat container in mobile viewport height ([a39c13d](https://github.com/Simon-He95/markstream-vue/commit/a39c13db3886a54746f4ece033315bfa4cf553ee))
* **ci:** switch to corepack for pnpm setup and activation ([6dec5db](https://github.com/Simon-He95/markstream-vue/commit/6dec5dba800aac4fc3edb9af204416554558f134))
* **ci:** update CI configuration to use matrix for OS and Node versions ([e247b9d](https://github.com/Simon-He95/markstream-vue/commit/e247b9d1a3c16b7929027d85561373407c9014a8))
* **ci:** update CI steps for consistency and clarity in git configuration and node setup ([ac7dcdc](https://github.com/Simon-He95/markstream-vue/commit/ac7dcdc9f7ad9f7472e14d2488f5cf0974ac2443))
* **demo:** update demo site URL for improved accessibility ([3a6a504](https://github.com/Simon-He95/markstream-vue/commit/3a6a5046b4fc3efd943dfca6f4dafdcddb56683f))
* **katex:** improve error handling for worker initialization and fallback rendering ([01e434d](https://github.com/Simon-He95/markstream-vue/commit/01e434d90fcf73ed80b66ebce0672c13c18796f2))
* **math:** enhance math recognition for incomplete TeX commands and improve loading state handling ([5a955ac](https://github.com/Simon-He95/markstream-vue/commit/5a955ac503cdc21c198949938c98951b64e573a2))


### Features

* **markdown:** enhance markdown processing with new inline token handling and sanitization ([f128740](https://github.com/Simon-He95/markstream-vue/commit/f128740f79526fe5b9590d51c3f9d873c39d8836))



## [0.0.56-beta.4](https://github.com/Simon-He95/markstream-vue/compare/v0.0.56-beta.3...v0.0.56-beta.4) (2025-10-10)


### Bug Fixes

* **math:** add heuristic to exclude date/time patterns from math classification ([cde9c69](https://github.com/Simon-He95/markstream-vue/commit/cde9c691bea911db74c47371f419f66fd6b406db))
* **math:** enhance KaTeX rendering with caching and debug support ([b22ffa9](https://github.com/Simon-He95/markstream-vue/commit/b22ffa9df9729e9b124ea00005a84833c1bfab54))
* **math:** improve handling of math delimiters and escape sequences ([b06e11c](https://github.com/Simon-He95/markstream-vue/commit/b06e11c3101daa022b3b74e8029fbeeb42bdad25))



## [0.0.56-beta.3](https://github.com/Simon-He95/markstream-vue/compare/v0.0.56-beta.2...v0.0.56-beta.3) (2025-10-10)



## [0.0.56-beta.2](https://github.com/Simon-He95/markstream-vue/compare/v0.0.56-beta.1...v0.0.56-beta.2) (2025-10-10)


### Bug Fixes

* correct CSS properties for checkbox and text nodes ([c3c9bf5](https://github.com/Simon-He95/markstream-vue/commit/c3c9bf554aa0040d1646edf570fe5f295c458aee))
* lint duplicated ci ([6715903](https://github.com/Simon-He95/markstream-vue/commit/6715903f96d3a3caa2bc6db576d9c4a5e427f67c))
* **markdown:** correct LaTeX syntax for mathematical expressions and enhance clarity ([96266d1](https://github.com/Simon-He95/markstream-vue/commit/96266d1be24c4e8a74e878244c6f94ea07cb8f72))
* **math:** adjust interval timing and improve math rendering logic ([b076c15](https://github.com/Simon-He95/markstream-vue/commit/b076c159bcdfa010efd52d74d32d6e05704ae494))


### Features

* enhance auto-scroll behavior with user interaction detection for better UX ([209448b](https://github.com/Simon-He95/markstream-vue/commit/209448b7094f59e55d16a3e1adf958888cbd4880))
* implement isMathLike heuristic and add corresponding tests ([050537e](https://github.com/Simon-He95/markstream-vue/commit/050537e042b6fe30a12e3884b19a5e5b83408f46))
* **math:** enhance math rendering and parsing capabilities ([934d60b](https://github.com/Simon-He95/markstream-vue/commit/934d60b672367429bad6050cdc7039bea0fadbd3))
* **math:** enhance normalization of backslashes and improve test coverage ([c4dc156](https://github.com/Simon-He95/markstream-vue/commit/c4dc1565a6f121736a561178653b3cf908d6e228))
* **math:** enhance regex for KaTeX commands and strong text handling ([1584dcc](https://github.com/Simon-He95/markstream-vue/commit/1584dcca3e001c338ca8027a8310cabcea1254ac))
* **scroll:** enhance auto-scroll behavior with user scroll tracking ([496ebd5](https://github.com/Simon-He95/markstream-vue/commit/496ebd56031e3d580e1334a23ad3e01ac6f3cf2b))



## [0.0.56-beta.1](https://github.com/Simon-He95/markstream-vue/compare/v0.0.56-beta.0...v0.0.56-beta.1) (2025-10-08)



## [0.0.56-beta.0](https://github.com/Simon-He95/markstream-vue/compare/v0.0.55...v0.0.56-beta.0) (2025-10-08)


### Bug Fixes

* ensure inline content is parsed correctly in container rendering ([cc14970](https://github.com/Simon-He95/markstream-vue/commit/cc14970c45a9726d1206e3a7cf1bee39ec1e7387))
* simplify error handling in user interaction event ([d8e2c05](https://github.com/Simon-He95/markstream-vue/commit/d8e2c0592bea6cbe9ee845e81756cfc37ad53848))


### Features

* add support for checkbox input nodes and update related components ([8b949ae](https://github.com/Simon-He95/markstream-vue/commit/8b949ae0ee597d1d0a903ab5eb88f9aa601e19e8))
* enhance auto-scroll functionality with user interaction detection ([f5d161f](https://github.com/Simon-He95/markstream-vue/commit/f5d161f3285254b406ef7c09a0bfe676e21dbf48))



## [0.0.55](https://github.com/Simon-He95/markstream-vue/compare/v0.0.55-beta.2...v0.0.55) (2025-10-07)


### Features

* Add GitHub star button to header ([0571ccc](https://github.com/Simon-He95/markstream-vue/commit/0571ccceb67a49181f3dbfafcddc56285869b732))
* Enhance math rendering with abort signal and cleanup for trailing backticks ([b41779b](https://github.com/Simon-He95/markstream-vue/commit/b41779b5e1b1984ef85394b5251f2ba5bd1eae60))
* Transform playground into chatbot-style interface with fixed height container ([c24f52c](https://github.com/Simon-He95/markstream-vue/commit/c24f52c9bbd494cfc4b42bd0e87e8fd811d7fc21))



## [0.0.55-beta.2](https://github.com/Simon-He95/markstream-vue/compare/v0.0.55-beta.1...v0.0.55-beta.2) (2025-10-03)


### Bug Fixes

* update base configuration comments for clarity in vite.config.ts ([343cc31](https://github.com/Simon-He95/markstream-vue/commit/343cc31c5a358e404247f9cf2bf868d737c4cf88))



## [0.0.55-beta.1](https://github.com/Simon-He95/markstream-vue/compare/v0.0.55-beta.0...v0.0.55-beta.1) (2025-10-03)


### Features

* add support for Mermaid blocks in NodeRenderer and update related components ([bda601c](https://github.com/Simon-He95/markstream-vue/commit/bda601cc7793bb66830d5ddacbb923b7743dd4b4))



## [0.0.55-beta.0](https://github.com/Simon-He95/markstream-vue/compare/v0.0.54-beta.9...v0.0.55-beta.0) (2025-10-03)


### Bug Fixes

* codeLanguage update ([8642453](https://github.com/Simon-He95/markstream-vue/commit/864245330e2e19627c2af0ea4d98b84a1a355373))


### Features

* add MarkdownCodeBlockNode for lightweight syntax highlighting and flexible code rendering options ([d71c32d](https://github.com/Simon-He95/markstream-vue/commit/d71c32d8f231b558e5fcb17ab5094ca9b0dd1e5c))
* Add Monaco-like header capabilities to MarkdownCodeBlockNode ([e3d4cce](https://github.com/Simon-He95/markstream-vue/commit/e3d4ccec5a6bc67bbd7926ea0685c670e949623c))



## [0.0.54-beta.9](https://github.com/Simon-He95/markstream-vue/compare/v0.0.54-beta.8...v0.0.54-beta.9) (2025-10-02)


### Bug Fixes

* **CodeBlockNode:** restore editor creation logic and update code handling ([a507cc4](https://github.com/Simon-He95/markstream-vue/commit/a507cc498fc1a316c5c59ea8ba8859ccfdba15e3))


### Features

* add demo content and structure for Electron + Vue chat application ([1621138](https://github.com/Simon-He95/markstream-vue/commit/1621138bf36def5de393092de39b30e2010926c0))
* add normalizeStandaloneBackslashT function and corresponding tests for escape sequences ([50b8cb9](https://github.com/Simon-He95/markstream-vue/commit/50b8cb99efe79f80c32c98e4e7b770c53d6250fc))
* implement off-thread rendering for KaTeX and Mermaid diagrams ([6ac59d6](https://github.com/Simon-He95/markstream-vue/commit/6ac59d62244a0f2885cb139273cf4112c5f05d9f))



## [0.0.54-beta.8](https://github.com/Simon-He95/markstream-vue/compare/v0.0.54-beta.7...v0.0.54-beta.8) (2025-09-29)


### Bug Fixes

* **code-block:** use Monaco default as initial font baseline and await editor creation to fix first-decrease issue ([8191156](https://github.com/Simon-He95/markstream-vue/commit/81911561ac688c65d0f8365dbe19614e5ce5adfc))
* **dependencies:** update vue-use-monaco to version 0.0.33 ([1f72589](https://github.com/Simon-He95/markstream-vue/commit/1f725896369168546c86f98950d23a889cbf3643))
* **TableNode:** ensure text color is white in dark mode for header cells ([b2adb88](https://github.com/Simon-He95/markstream-vue/commit/b2adb880a32dc01b4ffb2c73877b57aa2d313f99))
* update markdown content and reintroduce KaTeX CSS import ([a43b256](https://github.com/Simon-He95/markstream-vue/commit/a43b256c30d29d1a1927358eb3daf0847bd6f8df))
* update vue-use-monaco dependency to version 0.0.32 ([a20dad4](https://github.com/Simon-He95/markstream-vue/commit/a20dad44dc486c99fc8849792c138ecbf83faa96))


### Features

* **CodeBlockNode:** add header-only collapse mode for code-block ([#42](https://github.com/Simon-He95/markstream-vue/issues/42)) ([05354ab](https://github.com/Simon-He95/markstream-vue/commit/05354ab6783305118fdee65b3503abab85196134))


### Reverts

* **MathBlock:** The commit 14b4e98 caused KaTeX math formulas to fail to render properly. Temporarily revert the mathnode-related changes in this commit. ([0165ad2](https://github.com/Simon-He95/markstream-vue/commit/0165ad2bd951064ef6a47c037e9e51fadc1e34b8))



## [0.0.54-beta.7](https://github.com/Simon-He95/markstream-vue/compare/v0.0.54-beta.6...v0.0.54-beta.7) (2025-09-27)


### Features

* add support for Mermaid block nodes and enhance code block handling ([d86a78f](https://github.com/Simon-He95/markstream-vue/commit/d86a78f0e9471965c60f904f71b65292c0ddd0d5))
* enhance node component handling and add support for custom components ([6cd3f19](https://github.com/Simon-He95/markstream-vue/commit/6cd3f19052ba92e06732f44f07f4b79cf84472aa))



## [0.0.54-beta.6](https://github.com/Simon-He95/markstream-vue/compare/v0.0.54-beta.5...v0.0.54-beta.6) (2025-09-26)


### Bug Fixes

* **LinkNode:** update link text wrapper to use inline-flex for better alignment ([bff4520](https://github.com/Simon-He95/markstream-vue/commit/bff45202bda81da1f9a473179b66918236ecdca9))



## [0.0.54-beta.5](https://github.com/Simon-He95/markstream-vue/compare/v0.0.54-beta.4...v0.0.54-beta.5) (2025-09-26)


### Bug Fixes

* **App.vue:** adjust main content width and set max-width for prose ([f0f25a2](https://github.com/Simon-He95/markstream-vue/commit/f0f25a2ebceee9ef04d2551ceaf695f2122ececc))
* **ListNode:** marker ([39b48aa](https://github.com/Simon-He95/markstream-vue/commit/39b48aa1dd87f3138286a76dc1bc39224e6fda5f))


### Features

* enhance code block rendering with loading animation and improve template structure ([4dbb857](https://github.com/Simon-He95/markstream-vue/commit/4dbb8572ab463865a847420d7aeb2db6f776cbf4))
* **ImageNode:** add support for custom loading and error slots; enhance image loading experience ([eb4f795](https://github.com/Simon-He95/markstream-vue/commit/eb4f795638f788b74bbd41dd5d890721e0cd1260)), closes [#38](https://github.com/Simon-He95/markstream-vue/issues/38)
* **ImageNode:** add usePlaceholder prop to toggle placeholder display during image loading ([091eb70](https://github.com/Simon-He95/markstream-vue/commit/091eb70bc5dcad291a9979f01ababa850dfdcb2b))
* **LinkNode:** enhance link styling with customizable props for animation and appearance ([d5d7369](https://github.com/Simon-He95/markstream-vue/commit/d5d73694e4adbb692d238b94485cc2df84ab05e0))
* **markdown-parser:** enhance inline token parsing to support image syntax ([8730505](https://github.com/Simon-He95/markstream-vue/commit/8730505cc49bd329b7cf3b4b09e645db89c9f00f))
* **MermaidBlockNode:** add header-only collapse mode for Mermaid ([cfd11d9](https://github.com/Simon-He95/markstream-vue/commit/cfd11d9741fdc2830588d395d0603c8efb67f6ba))
* **MermaidBlockNode:** update collapse button icon and adjust container reference ([192e774](https://github.com/Simon-He95/markstream-vue/commit/192e774e2baf03a45bdb512367927847a52ff850))
* **README:** add new prop renderCodeBlocksAsPre for lightweight code block rendering ([b01dc24](https://github.com/Simon-He95/markstream-vue/commit/b01dc2443144214fd6111e59dd91653ef0ec63a6))
* **README:** add renderCodeBlocksAsPre prop for lightweight code block rendering ([ba2728f](https://github.com/Simon-He95/markstream-vue/commit/ba2728f8d23a172a771681e5bd3ca5979ab92f9a))
* **README:** update example markdown syntax for clarity ([f3523ff](https://github.com/Simon-He95/markstream-vue/commit/f3523ffd82ae0d4bc5076a9d63b136aa927aa668))


### Performance Improvements

* linkBlock render ([c4d3a70](https://github.com/Simon-He95/markstream-vue/commit/c4d3a70dfe8059bb7037ac47da1597246986c2bc))



## [0.0.54-beta.4](https://github.com/Simon-He95/markstream-vue/compare/v0.0.54-beta.3...v0.0.54-beta.4) (2025-09-24)


### Bug Fixes

* update vue-use-monaco version to 0.0.31 in package.json and pnpm-lock.yaml; adjust diff parsing in fence-parser.ts for improved line handling ([3e75591](https://github.com/Simon-He95/markstream-vue/commit/3e75591f3ff3e8e9f8c58ce14a4e409459206e81))
* updateCollapsedHeight ([c09179d](https://github.com/Simon-He95/markstream-vue/commit/c09179d0fe9c89318c90e5b0ad3b8f665c2267da))


### Features

* add PreCodeNode component for rendering code blocks as plain <pre><code> elements; update NodeRenderer to support new rendering option ([3cc460c](https://github.com/Simon-He95/markstream-vue/commit/3cc460c620983f3b6c3ac74bf6faa89b04eefb2a))
* add Tooltip component to GlobalComponents; refactor MathBlockNode and MathInlineNode for improved rendering and cleanup ([14b4e98](https://github.com/Simon-He95/markstream-vue/commit/14b4e981ce0468ac45a5b069304eb1155675d607))
* enhance admonition support with error type and collapsible feature; improve markdown parsing safety ([8feb7cc](https://github.com/Simon-He95/markstream-vue/commit/8feb7cc65fb90c551ece05494ae15287ece2c68c))
* **ImageNode:** enhance image loading with fallback support and loading state; update i18n for load error message ([7dddce1](https://github.com/Simon-He95/markstream-vue/commit/7dddce1330033ab43f995192b52f02c15d385e27))



## [0.0.54-beta.3](https://github.com/Simon-He95/markstream-vue/compare/v0.0.54-beta.2...v0.0.54-beta.3) (2025-09-23)


### Bug Fixes

* **vite.config:** refine externalization logic for 'mermaid' package to prevent local file conflicts ([0d06b62](https://github.com/Simon-He95/markstream-vue/commit/0d06b6257d5d04da07195edaa0d4ffda46fdc79b))



## [0.0.54-beta.2](https://github.com/Simon-He95/markstream-vue/compare/v0.0.54-beta.1...v0.0.54-beta.2) (2025-09-23)


### Bug Fixes

* auto height compute ([ebd24c0](https://github.com/Simon-He95/markstream-vue/commit/ebd24c001e42a647c31b85ffd08b760e0df5d6ce))
* code diff block can expand now ([62158b2](https://github.com/Simon-He95/markstream-vue/commit/62158b2628937acdda173f8d7a8ca5a3ff43c303))
* update vue-renderer-markdown dependency to latest version ([7ad8fb4](https://github.com/Simon-He95/markstream-vue/commit/7ad8fb4b3ddf09c4db8cd889efdc9939fe5bcac5))


### Features

* add demo content and setup instructions for Electron + Vue chat application ([77539ef](https://github.com/Simon-He95/markstream-vue/commit/77539ef72864e7c201377ed577c529fcbd9263ef))
* **CodeBlockNode, NodeRenderer:** add min/max width props for code block customization ([08ef2ab](https://github.com/Simon-He95/markstream-vue/commit/08ef2abe83f49e5c9126cd2f3192527d1dcfba47))
* **CodeBlockNode:** add customizable header options for enhanced user control ([1b73f53](https://github.com/Simon-He95/markstream-vue/commit/1b73f5358c95d3d42063e496b436b0ed9802963a)), closes [#33](https://github.com/Simon-He95/markstream-vue/issues/33)
* **CodeBlockNode:** integrate themes and Monaco options for enhanced customization ([b9579dc](https://github.com/Simon-He95/markstream-vue/commit/b9579dc2cb63c8d66f5a845227934adccf24abb2))
* enhance code block handling with diff support and update package metadata ([52523e7](https://github.com/Simon-He95/markstream-vue/commit/52523e7d3b28c681639a0de1f3c44b514f6a0510))
* implement diff editor view handling in CodeBlockNode component ([a1e7813](https://github.com/Simon-He95/markstream-vue/commit/a1e7813aa1be5f56757c72eab498351fb98056b7))
* import styles for vue-renderer-markdown in main application ([25dcdd1](https://github.com/Simon-He95/markstream-vue/commit/25dcdd171e322023e50bc1b0cc5f21b6979b966e))



## [0.0.54-beta.1](https://github.com/Simon-He95/markstream-vue/compare/v0.0.54-beta.0...v0.0.54-beta.1) (2025-09-19)


### Bug Fixes

* add cleanup logic on component unmount to prevent memory leaks ([5ad2f78](https://github.com/Simon-He95/markstream-vue/commit/5ad2f78d5baab9696aec86755fef5651be8d8aba))
* expand code on loading is false ([f8d1a76](https://github.com/Simon-He95/markstream-vue/commit/f8d1a761eaa65390648134be9e4796100c546673))
* reorder tooltip imports for consistency and clarity ([5ef26db](https://github.com/Simon-He95/markstream-vue/commit/5ef26db7b996a864a8c1eb4d43089b95c65ce492))
* update fallback component for CodeBlockNode to InlineCodeNode in error handling ([02d71df](https://github.com/Simon-He95/markstream-vue/commit/02d71df81f729230813f9534894ef6c95c190536))


### Features

* add support for custom languageicon [#28](https://github.com/Simon-He95/markstream-vue/issues/28) ([4e2d6b0](https://github.com/Simon-He95/markstream-vue/commit/4e2d6b012b9ea41a792eafbfdf985b6395dea483))
* add Tooltip component and integrate it into CodeBlockNode for enhanced user interaction ([0dfa2dc](https://github.com/Simon-He95/markstream-vue/commit/0dfa2dca85c01f916332822cf0a9bc7916458df3))
* add vue-renderer-markdown dependency to enhance markdown rendering capabilities ([89abe35](https://github.com/Simon-He95/markstream-vue/commit/89abe35107e165b801c381e7710e218f97c2a9ca))
* **CodeBlockNode:** add font size control functionality to CodeBlockNode ([f54265c](https://github.com/Simon-He95/markstream-vue/commit/f54265ca4750c7f55bab9ab01ca7abd30f8689f8))
* enhance getMarkdown function to support user-defined plugins and apply functions ([9e8aa8b](https://github.com/Simon-He95/markstream-vue/commit/9e8aa8b5ca22dd1ede2774d5fec5e1295e9abc04))
* enhance tooltip functionality with origin coordinates for smoother animations ([743e68f](https://github.com/Simon-He95/markstream-vue/commit/743e68f3fb40ef81b31b5e4ce1f02cd9a69ca9ab))



## [0.0.54-beta.0](https://github.com/Simon-He95/markstream-vue/compare/v0.0.53...v0.0.54-beta.0) (2025-09-17)


### Features

* enhance markdown token metadata for compatibility with plugins and tests ([6ab3dcd](https://github.com/Simon-He95/markstream-vue/commit/6ab3dcd615b50d748994a19f7bc3f93fe5495c77))



## [0.0.53](https://github.com/Simon-He95/markstream-vue/compare/v0.0.52-beta.3...v0.0.53) (2025-09-17)


### Features

* add error handling and state management for rendering process ([032fc01](https://github.com/Simon-He95/markstream-vue/commit/032fc01ec651643a624367dbcdcf0257a4786d34))



## [0.0.52-beta.3](https://github.com/Simon-He95/markstream-vue/compare/v0.0.52-beta.2...v0.0.52-beta.3) (2025-09-17)


### Features

* optimize rendering by tracking last rendered code and skipping redundant renders ([092f759](https://github.com/Simon-He95/markstream-vue/commit/092f7590855370e41c2030115a55e1d12ce3d0e6))



## [0.0.52-beta.2](https://github.com/Simon-He95/markstream-vue/compare/v0.0.52-beta.1...v0.0.52-beta.2) (2025-09-17)


### Features

* enhance MermaidBlockNode with safe prefix candidate and smooth mode switching ([641fccd](https://github.com/Simon-He95/markstream-vue/commit/641fccdc8f22d342cda694a2a40f9f8907d0a55f))



## [0.0.52-beta.1](https://github.com/Simon-He95/markstream-vue/compare/v0.0.52-beta.0...v0.0.52-beta.1) (2025-09-16)


### Bug Fixes

* normalize standalone backslash-t in math block tokens ([74cb769](https://github.com/Simon-He95/markstream-vue/commit/74cb769cc3411b6b3f2875edce41ace68ba3fbc3))



## [0.0.52-beta.0](https://github.com/Simon-He95/markstream-vue/compare/v0.0.50...v0.0.52-beta.0) (2025-09-16)


### Bug Fixes

* update parser worker import to use URL for improved compatibility ([a3464d5](https://github.com/Simon-He95/markstream-vue/commit/a3464d579c9d96df5a59f4c253ae8e0530275360))
* update version to 0.0.50-alpha.4 and remove CSS build script ([d0a37f8](https://github.com/Simon-He95/markstream-vue/commit/d0a37f828959a991999a7958feab79f7b8c78052))
* update version to 0.0.51 in package.json ([63800f1](https://github.com/Simon-He95/markstream-vue/commit/63800f1d2687151fa0836a62824f979ae9d605f1))


### Features

* add ESM support for web workers in Vite configuration ([5243dcd](https://github.com/Simon-He95/markstream-vue/commit/5243dcdf72dafd60c89986781c93bc4f3ebde8c2))



## [0.0.50](https://github.com/Simon-He95/markstream-vue/compare/v0.0.49...v0.0.50) (2025-09-16)


### Bug Fixes

* correct formatting in conditional check for Mermaid editor cleanup ([4eb4daf](https://github.com/Simon-He95/markstream-vue/commit/4eb4daf1e6acdf8b5aeffe3a0caff0849ab11245))


### Features

* Enhance Mermaid diagram rendering with progressive loading and error handling ([6613a5c](https://github.com/Simon-He95/markstream-vue/commit/6613a5c4bf5ac03dcfea8ab8e8e8a64ddaa8156c))
* implement fence streaming support and enhance code block parsing ([1c72879](https://github.com/Simon-He95/markstream-vue/commit/1c72879ccbd5d19fc0662aff36673bea3aea25d5))



## [0.0.49](https://github.com/Simon-He95/markstream-vue/compare/v0.0.48...v0.0.49) (2025-09-15)


### Bug Fixes

* **CodeBlockNode:** languageIcon ([c81e5c2](https://github.com/Simon-He95/markstream-vue/commit/c81e5c273ef0d1353a236f7d2bfa06b655d21ac9))
* **MermaidBlockNode:** resolve rendering issues during view mode switching ([6f3dcc5](https://github.com/Simon-He95/markstream-vue/commit/6f3dcc580d78d706fc837b1c5a2f88e3b1f24ef6))
* support detect code fence close ([c3ef7ec](https://github.com/Simon-He95/markstream-vue/commit/c3ef7eccfd755bd773b1f00d46c16341d83c252c))


### Features

* add expand for code block ([ed7006e](https://github.com/Simon-He95/markstream-vue/commit/ed7006ecb26347fcd2b692444502f845cdeb6da9))
* **theme-toggle:** add theme switch button and integrate iconify for dark mode ([c9a2dd4](https://github.com/Simon-He95/markstream-vue/commit/c9a2dd4932fec4072c6ceaf0a98b0891c151f888))


### Performance Improvements

* **renderer): remove typing-burst class toggling and fade last-child via TransitionGroup\n\n- Replace container reflow approach with TransitionGroup enter-only animations\n- Keep cursor logic; only reposition on content growth\n- Avoid forced reflow and class churn for better perf\n\nperf(code-block:** lazy-init Monaco editors when visible\n\n- Create Monaco editor only after code block enters viewport\n- Fade only outer container; isolate editor layout via contain: content\n- Reduce layout thrash during transitions and improve smoothness ([2198747](https://github.com/Simon-He95/markstream-vue/commit/21987474b5be69887af84d95c4d05f721536baf8))



## [0.0.48](https://github.com/Simon-He95/markstream-vue/compare/v0.0.47...v0.0.48) (2025-09-13)


### Bug Fixes

* improve peer dependency check and auto-install functionality ([f896b72](https://github.com/Simon-He95/markstream-vue/commit/f896b7202313798c5ef1da12c0efa1c51dbd33a4)), closes [#22](https://github.com/Simon-He95/markstream-vue/issues/22)



## [0.0.47](https://github.com/Simon-He95/markstream-vue/compare/v0.0.46...v0.0.47) (2025-09-12)


### Bug Fixes

* update type imports for Monaco themes in CodeBlockNode.vue ([50f79fa](https://github.com/Simon-He95/markstream-vue/commit/50f79faae65d4a5f7c5993b3e62da19b5f1a1033))



## [0.0.46](https://github.com/Simon-He95/markstream-vue/compare/v0.0.45...v0.0.46) (2025-09-12)


### Bug Fixes

* a better way for auto scroll ([dcceb57](https://github.com/Simon-He95/markstream-vue/commit/dcceb571b4f784dbf9d229b56c0dca320ac73488))
* optimize null checking in parseCodeBlock ([092d787](https://github.com/Simon-He95/markstream-vue/commit/092d787f9d5cbcddcb30a48957097553b96f8d6a))


### Performance Improvements

* remove rafThrottle to vue-use-monaco & monaco scroll behavior ([f9a4f7b](https://github.com/Simon-He95/markstream-vue/commit/f9a4f7b1a0cd05a723abbed3785da68f7641a046))



## [0.0.45](https://github.com/Simon-He95/markstream-vue/compare/v0.0.44...v0.0.45) (2025-09-11)


### Performance Improvements

* stream appendCode ([b45d128](https://github.com/Simon-He95/markstream-vue/commit/b45d1284919805de45afd894c7e442b366d066d3))



## [0.0.44](https://github.com/Simon-He95/markstream-vue/compare/v0.0.43...v0.0.44) (2025-09-09)



## [0.0.43](https://github.com/Simon-He95/markstream-vue/compare/v0.0.42...v0.0.43) (2025-09-08)



## [0.0.42](https://github.com/Simon-He95/markstream-vue/compare/v0.0.41...v0.0.42) (2025-09-08)


### Bug Fixes

* add fullscreen button disable logic and update button styles ([194d10b](https://github.com/Simon-He95/markstream-vue/commit/194d10b41e78c304116002733b8ee07bd31cb83f))
* update vue-renderer-markdown dependency to latest version ([f08c529](https://github.com/Simon-He95/markstream-vue/commit/f08c529b506e1c25381456865e9fb748fa07bc2e))


### Performance Improvements

* add debounce render ([89b1808](https://github.com/Simon-He95/markstream-vue/commit/89b1808d2ae59103656b6fd7bb713b916ce154e9))



## [0.0.41](https://github.com/Simon-He95/markstream-vue/compare/v0.0.40...v0.0.41) (2025-09-08)


### Bug Fixes

* auto-adaptive height of MermaidBlockNode ([68fd38f](https://github.com/Simon-He95/markstream-vue/commit/68fd38f84d7b1a52de02cf49f661c1a061aa6461))
* improve code readability by simplifying conditional statements and formatting ([e92782b](https://github.com/Simon-He95/markstream-vue/commit/e92782b38c0cedc624df94e44ac133a249025520))
* keep mermaid container more tight ([6eda7e0](https://github.com/Simon-He95/markstream-vue/commit/6eda7e03c5748a26c8a71afb89c6d4b8ae0acc5a))


### Features

* **MermaidBlockNode:** add fullscreen ([10b1992](https://github.com/Simon-He95/markstream-vue/commit/10b19921613117a3bde475e468699cae6fc219c1))



## [0.0.40](https://github.com/Simon-He95/markstream-vue/compare/v0.0.39...v0.0.40) (2025-09-06)



## [0.0.39](https://github.com/Simon-He95/markstream-vue/compare/v0.0.38...v0.0.39) (2025-09-06)


### Bug Fixes

* update KaTeX rendering options to ignore strict parsing for MathBlockNode and MathInlineNode ([bdeee7c](https://github.com/Simon-He95/markstream-vue/commit/bdeee7c103c853da8cc0a783eb90fa09a9980cf1))


### Features

* add support for Mermaid diagrams and enhance code block parsing ([72fbea4](https://github.com/Simon-He95/markstream-vue/commit/72fbea42685b3c43d695f7e5f44eaf454382d30c))



## [0.0.38](https://github.com/Simon-He95/markstream-vue/compare/v0.0.37...v0.0.38) (2025-09-05)


### Bug Fixes

* improve smooth scrolling functionality and update type re-exports ([5d8ce4a](https://github.com/Simon-He95/markstream-vue/commit/5d8ce4a72b58c8622c4f00fc64a7f8649dc733f6))
* remove packageManager field from package.json ([23cec95](https://github.com/Simon-He95/markstream-vue/commit/23cec9559c3f1216754e6562e0bb012566d1f10b))
* update vue-renderer-markdown dependency to version ^0.0.37 and ensure proper build configuration ([a938f28](https://github.com/Simon-He95/markstream-vue/commit/a938f285e92faf9609c201773a72e97e8a02d7ba))


### Features

* update auto-imports and dependencies for VueUse and improve AdmonitionNode styles ([3882253](https://github.com/Simon-He95/markstream-vue/commit/388225390d9420dccff8b9df8137d7ee17500bc0))



## [0.0.37](https://github.com/Simon-He95/markstream-vue/compare/v0.0.36...v0.0.37) (2025-09-04)


### Bug Fixes

* improve smooth scrolling behavior and optimize cursor updates in NodeRenderer ([382d0f0](https://github.com/Simon-He95/markstream-vue/commit/382d0f030afd3f28123ad188b823c5eb292b1d4a))
* streamline type re-export in auto-imports and update build command in netlify.toml ([f035bff](https://github.com/Simon-He95/markstream-vue/commit/f035bff20dc2b6f2df426805980d87cf30727ab0))


### Features

* implement container and math plugins for enhanced markdown rendering ([4ca52fd](https://github.com/Simon-He95/markstream-vue/commit/4ca52fd39d285602d6b3b207f037a1aa6b667332))



## [0.0.36](https://github.com/Simon-He95/markstream-vue/compare/v0.0.35...v0.0.36) (2025-09-02)


### Bug Fixes

* build ([f4ab54b](https://github.com/Simon-He95/markstream-vue/commit/f4ab54bf490e2b496caa28e19c09071ce2c89911))
* **button:** add missing props to resolve Vue warnings ([b8a7964](https://github.com/Simon-He95/markstream-vue/commit/b8a79646fb6ecf65ee97e7e631982f5bd4fc47ef))
* **CodeBlockNode:** add MonacoOptions prop and update editor configuration ([47c6457](https://github.com/Simon-He95/markstream-vue/commit/47c6457e5be43a6358ec5596176af66c60d22f63))
* **i18n:** add missing translation keys for copy functionality ([6a247e1](https://github.com/Simon-He95/markstream-vue/commit/6a247e1c32caff2a046d2a0fefe436d908cfee75))
* improve error handling security ([b31edbb](https://github.com/Simon-He95/markstream-vue/commit/b31edbbb2ae3e9aa5a3dcbc7ec2b5223ec6f3c1e))
* **mermaid:** resolve race conditions and UI flicker issues ([b8d78dc](https://github.com/Simon-He95/markstream-vue/commit/b8d78dcbee5f2f98795c9a9063b96da527c3488c))
* **playground:** build ([f33cf16](https://github.com/Simon-He95/markstream-vue/commit/f33cf16da0f50ed75a2300c0c9c72b72f69b850d))


### Features

* **mermaid:** add auto-switch to preview when content generation completes ([77c81a5](https://github.com/Simon-He95/markstream-vue/commit/77c81a5ef71812f3901999433d5025f8116eabd0))



## [0.0.35](https://github.com/Simon-He95/markstream-vue/compare/v0.0.34...v0.0.35) (2025-09-01)


### Features

* **mermaid:** add automatic dark theme support ([b890ab4](https://github.com/Simon-He95/markstream-vue/commit/b890ab400dd87b0683950addd9499fc95550870b))
* **mermaid:** add mouse wheel zoom support with Ctrl/Cmd modifier ([28202bf](https://github.com/Simon-He95/markstream-vue/commit/28202bf33c961c35c8a806b6ed5341fb477544ff))



## [0.0.34](https://github.com/Simon-He95/markstream-vue/compare/v0.0.33...v0.0.34) (2025-08-11)


### Bug Fixes

* **math:** parser ([871447c](https://github.com/Simon-He95/markstream-vue/commit/871447c8c5443da6e9236d9094fa64ac896a2f3f))



## [0.0.33](https://github.com/Simon-He95/markstream-vue/compare/v0.0.32...v0.0.33) (2025-08-04)


### Features

* integrate Tailwind CSS and refactor components ([3663c73](https://github.com/Simon-He95/markstream-vue/commit/3663c738a81fbc662ec6fdae52cd32bbbca5d5bb))



## [0.0.32](https://github.com/Simon-He95/markstream-vue/compare/v0.0.31...v0.0.32) (2025-08-02)


### Features

* add typewriter effect for streaming content in Markdown renderer ([27f7cd8](https://github.com/Simon-He95/markstream-vue/commit/27f7cd8916d12b9cb9a041ebf981e89a343e134a))



## [0.0.31](https://github.com/Simon-He95/markstream-vue/compare/v0.0.30...v0.0.31) (2025-06-30)


### Bug Fixes

* update NPM badge link to correct package name ([eb31f9c](https://github.com/Simon-He95/markstream-vue/commit/eb31f9c802357469dfb441ecdb8622a12440e7ea))



## [0.0.30](https://github.com/Simon-He95/markstream-vue/compare/v0.0.29...v0.0.30) (2025-06-18)


### Features

* implement auto-scrolling behavior in chat view based on user scroll position ([352ff37](https://github.com/Simon-He95/markstream-vue/commit/352ff37bebbd99bb1e0fdb3ddf5657f7ff1c1cb8))



## [0.0.29](https://github.com/Simon-He95/markstream-vue/compare/v0.0.28...v0.0.29) (2025-06-12)



## [0.0.28](https://github.com/Simon-He95/markstream-vue/compare/v0.0.27...v0.0.28) (2025-06-12)



## [0.0.27](https://github.com/Simon-He95/markstream-vue/compare/v0.0.26...v0.0.27) (2025-06-10)


### Bug Fixes

* add dir="auto" attribute to various components for improved text direction handling ([cba804e](https://github.com/Simon-He95/markstream-vue/commit/cba804e38c3afaba8685c45d4d78912a55f8149c))
* update MermaidBlockNode styling for improved content handling ([4cdb08f](https://github.com/Simon-He95/markstream-vue/commit/4cdb08fb705563f48b1b3c536e5172f0093b2d39))


### Features

* enhance scrolling behavior in chat application and refactor code structure ([5b2fdc9](https://github.com/Simon-He95/markstream-vue/commit/5b2fdc95569808c5cf5c28ffeb1920eb7e0eef33))



## [0.0.26](https://github.com/Simon-He95/markstream-vue/compare/v0.0.25...v0.0.26) (2025-06-06)


### Bug Fixes

* update unplugin-class-extractor to version 0.0.5 and adjust include pattern in Vite config ([5ae6d8e](https://github.com/Simon-He95/markstream-vue/commit/5ae6d8e130f6e97320d96dd5f0c04cc95e004056))



## [0.0.25](https://github.com/Simon-He95/markstream-vue/compare/v0.0.24...v0.0.25) (2025-06-06)


### Bug Fixes

* **markdown:** katex style lose ([7afe593](https://github.com/Simon-He95/markstream-vue/commit/7afe59393164481ecd995c645cc6aaf07bb09f54))
* update vue-use-monaco version to ^0.0.2 in package.json and pnpm-lock.yaml ([10aa0fb](https://github.com/Simon-He95/markstream-vue/commit/10aa0fb3b4177798da9db3d917e4ec804071db66))



## [0.0.24](https://github.com/Simon-He95/markstream-vue/compare/v0.0.23...v0.0.24) (2025-06-05)



## [0.0.23](https://github.com/Simon-He95/markstream-vue/compare/v0.0.22...v0.0.23) (2025-06-05)


### Features

* 兼容ai返回的markdown格式 ([970e9e7](https://github.com/Simon-He95/markstream-vue/commit/970e9e73eea14a9669bc2be6b452771504949d97))



## [0.0.22](https://github.com/Simon-He95/markstream-vue/compare/v0.0.9...v0.0.22) (2025-06-04)


### Bug Fixes

* revert version to 0.0.15 in package.json and remove markdown-it dependency from pnpm-lock.yaml ([f59b86d](https://github.com/Simon-He95/markstream-vue/commit/f59b86d4fb5fb10a1336ba0c7ad9eaa7f0607afd))
* style ([3f36584](https://github.com/Simon-He95/markstream-vue/commit/3f3658489b9ee1af910996cdeaf21cda56b4590d))
* update vue-i18n dependency version and clean up unused worker imports in useMonaco ([6d8a478](https://github.com/Simon-He95/markstream-vue/commit/6d8a4785822b2d9856fb805fa6cb4bf2cf20142f))
* **useCodeEditor:** correct theme variable initialization order ([cfb93cc](https://github.com/Simon-He95/markstream-vue/commit/cfb93cc16bb8281dbd87eadb26ed8efcc2d799c4))


### Features

* **CodeBlockNode:** support custom theme ([8017f26](https://github.com/Simon-He95/markstream-vue/commit/8017f26b0ffe9a65bd318609edcfec38cf32102d))
* **FootnoteReferenceNode:** enhance footnote scrolling behavior and update template structure ([43bd26a](https://github.com/Simon-He95/markstream-vue/commit/43bd26a08861c3f9fcb7da4c3251c6959728832f))
* integrate monaco-editor and add theme support in code editor ([fc319b5](https://github.com/Simon-He95/markstream-vue/commit/fc319b50505efa6237cf5f262ea90544427b7e0d))
* refactor component exports and add Vue plugin for Markdown rendering ([b1d71dc](https://github.com/Simon-He95/markstream-vue/commit/b1d71dc091746bb0bf5103ed89015e5081dbdea3))
* refactor node components management and enhance footnote parsing ([04e2e0b](https://github.com/Simon-He95/markstream-vue/commit/04e2e0bbbf70d44b9c27f1b69a129a056a960b2b))
* **theme:** export createTheme for external usage ([5ce0db6](https://github.com/Simon-He95/markstream-vue/commit/5ce0db6649c7b74838e9712b55ecacfc4805a9e5))
* update package exports structure and remove deprecated components file ([45197b2](https://github.com/Simon-He95/markstream-vue/commit/45197b2022dec8a978fe0ae2172505dbf822a46e))



## [0.0.9](https://github.com/Simon-He95/markstream-vue/compare/v0.0.8...v0.0.9) (2025-05-28)


### Bug Fixes

* style ([f0e65e7](https://github.com/Simon-He95/markstream-vue/commit/f0e65e723a03b4c333ff4a8a7f352f1c4b38e046))



## [0.0.8](https://github.com/Simon-He95/markstream-vue/compare/v0.0.7...v0.0.8) (2025-05-28)



## [0.0.7](https://github.com/Simon-He95/markstream-vue/compare/v0.0.6...v0.0.7) (2025-05-27)



## [0.0.6](https://github.com/Simon-He95/markstream-vue/compare/v0.0.5...v0.0.6) (2025-05-26)



## [0.0.5](https://github.com/Simon-He95/markstream-vue/compare/v0.0.4...v0.0.5) (2025-05-26)


### Bug Fixes

* refactor cleanupEditor function to ensure proper editor instance cleanup ([f16380f](https://github.com/Simon-He95/markstream-vue/commit/f16380f386bdf9b03758609c376244f9b5d73a31))



## [0.0.4](https://github.com/Simon-He95/markstream-vue/compare/v0.0.3...v0.0.4) (2025-05-26)


### Bug Fixes

* fix the dts error & support vue.use ([a462867](https://github.com/Simon-He95/markstream-vue/commit/a462867088cc3a4c95ab8fcc0e7f04da09763750))



## 0.0.3 (2025-05-26)



