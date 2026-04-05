import { describe, expect, it } from "vitest";
import { platform } from "./platform.js";
describe("platform", () => {
    it("uses Claude-specific auth and hints", () => {
        expect(platform.authPath).toBe("claude");
        expect(platform.displayName).toBe("Claude Code");
        expect(platform.cliBinary).toBe("claude");
        expect(platform.supportsAutoUpdate).toBe(true);
    });
});
