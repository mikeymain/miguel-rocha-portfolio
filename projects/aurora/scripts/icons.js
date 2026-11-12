import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import pngToIco from "png-to-ico";
const svg = (name) => readFileSync(new URL(`../assets/${name}`, import.meta.url), "utf8");
const render = (source, size) =>
  new Resvg(source, { fitTo: { mode: "width", value: size } }).render().asPng();
const full = svg("daybook.svg");
const small = svg("daybook-small.svg");
const SMALL_SIZES = [16, 24, 32];
const LARGE_SIZES = [48, 64, 128, 256];
writeFileSync(new URL("../assets/daybook.png", import.meta.url), render(full, 256));
const frames = [
  ...SMALL_SIZES.map((s) => render(small, s)),
  ...LARGE_SIZES.map((s) => render(full, s)),
];
writeFileSync(new URL("../assets/daybook.ico", import.meta.url), await pngToIco(frames));
