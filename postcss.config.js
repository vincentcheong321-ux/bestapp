import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';
import postcssPresetEnv from 'postcss-preset-env';

export default {
  plugins: [
    tailwindcss(),
    autoprefixer(),
    postcssPresetEnv({
      stage: 3,
      features: {
        'custom-properties': true,
        'nesting-rules': true,
      },
      browsers: 'chrome >= 44, android >= 6',
    }),
  ],
}
