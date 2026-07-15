import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const packageUrl = new URL("../../package.json", import.meta.url);
const buildPngUrl = new URL("../../build/icon.png", import.meta.url);
const rendererPngUrl = new URL("../../public/app-icon.png", import.meta.url);
const icnsUrl = new URL("../../build/icon.icns", import.meta.url);
const icoUrl = new URL("../../build/icon.ico", import.meta.url);

describe("application icon assets", () => {
  it("keeps the packaging and renderer PNGs identical, square, and RGBA", async () => {
    const [packagingIcon, rendererIcon] = await Promise.all([
      readFile(buildPngUrl),
      readFile(rendererPngUrl),
    ]);

    expect(rendererIcon.equals(packagingIcon)).toBe(true);
    expect(packagingIcon.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(packagingIcon.readUInt32BE(16)).toBe(1024);
    expect(packagingIcon.readUInt32BE(20)).toBe(1024);
    expect(packagingIcon[25]).toBe(6);
  });

  it("declares a structurally complete ICNS as the macOS packaging icon", async () => {
    const [packageText, icon] = await Promise.all([
      readFile(packageUrl, "utf8"),
      readFile(icnsUrl),
    ]);
    const manifest = JSON.parse(packageText) as {
      readonly build?: { readonly mac?: { readonly icon?: unknown } };
    };

    expect(manifest.build?.mac?.icon).toBe("build/icon.icns");
    expect(icon.subarray(0, 4).toString("ascii")).toBe("icns");
    expect(icon.readUInt32BE(4)).toBe(icon.byteLength);
  });

  it("declares a multi-resolution ICO as the Windows packaging icon", async () => {
    const [packageText, icon] = await Promise.all([readFile(packageUrl, "utf8"), readFile(icoUrl)]);
    const manifest = JSON.parse(packageText) as {
      readonly build?: { readonly win?: { readonly icon?: unknown } };
    };

    expect(manifest.build?.win?.icon).toBe("build/icon.ico");
    expect(icon.readUInt16LE(0)).toBe(0);
    expect(icon.readUInt16LE(2)).toBe(1);
    const imageCount = icon.readUInt16LE(4);
    expect(imageCount).toBeGreaterThanOrEqual(7);

    const dimensions = new Set<number>();
    for (let index = 0; index < imageCount; index += 1) {
      const entryOffset = 6 + index * 16;
      const widthByte = icon[entryOffset];
      const heightByte = icon[entryOffset + 1];
      expect(widthByte).toBeDefined();
      expect(heightByte).toBeDefined();
      const width = widthByte === 0 ? 256 : (widthByte as number);
      const height = heightByte === 0 ? 256 : (heightByte as number);
      const byteLength = icon.readUInt32LE(entryOffset + 8);
      const imageOffset = icon.readUInt32LE(entryOffset + 12);
      const image = icon.subarray(imageOffset, imageOffset + byteLength);

      expect(width).toBe(height);
      expect(icon.readUInt16LE(entryOffset + 4)).toBe(1);
      expect(icon.readUInt16LE(entryOffset + 6)).toBe(32);
      expect(image.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(image.readUInt32BE(16)).toBe(width);
      expect(image.readUInt32BE(20)).toBe(height);
      dimensions.add(width);
    }
    expect([...dimensions]).toEqual([16, 24, 32, 48, 64, 128, 256]);
  });
});
