/**
 * Where the generated country-flag sprite is served from. Flags are referenced out of one file
 * with <use>, so a 200-row country list costs one cached request and no JavaScript bundle weight.
 * Regenerate the file with: npm run generate:flag-sprite
 */
export const FLAG_SPRITE_URL = "/flags.svg";
