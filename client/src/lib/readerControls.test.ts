import { describe, expect, it } from "vitest";
import { nextReaderControlsHidden } from "./readerControls";

describe("سلوك شريط أدوات القارئ", () => {
  it("يختفي مع التمرير الواضح للأسفل ويعود مع التمرير الواضح للأعلى", () => {
    expect(nextReaderControlsHidden(100, 126, false)).toBe(true);
    expect(nextReaderControlsHidden(126, 108, true)).toBe(false);
  });

  it("يبقى ظاهرًا عند بداية المقال ويتجاهل الاهتزازات الصغيرة", () => {
    expect(nextReaderControlsHidden(8, 14, true)).toBe(false);
    expect(nextReaderControlsHidden(100, 106, false)).toBe(false);
  });
});
