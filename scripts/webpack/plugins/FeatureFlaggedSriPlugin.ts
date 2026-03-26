import webpack, { type Compiler } from 'webpack';

const { Template } = webpack;

const PLUGIN_NAME = 'FeatureFlaggedSRIPlugin';
const FEATURE_TOGGLE_WRAP = [
  'if (window.grafanaBootData && window.grafanaBootData.settings && window.grafanaBootData.settings.featureToggles && window.grafanaBootData.settings.featureToggles.assetSriChecks) {',
  '}',
];

/**
 * Webpack plugin that wraps Webpack runtime integrity checks in a feature flag.
 * This allows us to disable SRI checks in both the initial chunks but also in the
 * dynamically loaded chunks.
 */
export default class FeatureFlaggedSRIPlugin {
  apply(compiler: Compiler): void {
    compiler.hooks.afterPlugins.tap(PLUGIN_NAME, (compiler) => {
      const logger = compiler.getInfrastructureLogger(PLUGIN_NAME);
      compiler.hooks.thisCompilation.tap({ name: PLUGIN_NAME }, (compilation) => {
        const { mainTemplate } = compilation;
        mainTemplate.hooks.jsonpScript.tap(PLUGIN_NAME, (source: string) => {
          if (source.includes('script.integrity =')) {
            logger.log('FeatureFlaggedSRIPlugin: Wrapping SRI checks in feature flag');
            return createFeatureFlaggedSRITemplate(source);
          }
          return source;
        });
      });
    });
  }
}

function createFeatureFlaggedSRITemplate(source: string): string {
  const lines = source.split('\n');
  const integrityAttributeLineNumber = lines.findIndex((line) => line.includes('script.integrity ='));
  const [prefix, suffix] = FEATURE_TOGGLE_WRAP;
  return Template.asString([
    ...lines.slice(0, integrityAttributeLineNumber),
    prefix,
    Template.indent(lines.slice(integrityAttributeLineNumber)),
    suffix,
  ]);
}
