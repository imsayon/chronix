import { describe, it, expect, vi } from "vitest";
import { isIpBlocked, advisorySsrfCheck, SsrfBlockedError } from "./ssrf-check.js";

describe("SSRF Advisory Check", () => {
  describe("isIpBlocked", () => {
    it("blocks localhost", () => {
      expect(isIpBlocked("127.0.0.1", 4)).toBe(true);
      expect(isIpBlocked("127.255.255.254", 4)).toBe(true);
      expect(isIpBlocked("::1", 6)).toBe(true);
    });

    it("blocks RFC1918 private networks", () => {
      expect(isIpBlocked("10.0.0.1", 4)).toBe(true);
      expect(isIpBlocked("10.255.255.255", 4)).toBe(true);

      expect(isIpBlocked("172.16.0.1", 4)).toBe(true);
      expect(isIpBlocked("172.31.255.255", 4)).toBe(true);

      expect(isIpBlocked("192.168.0.1", 4)).toBe(true);
      expect(isIpBlocked("192.168.255.255", 4)).toBe(true);
    });

    it("blocks AWS IMDS / link-local", () => {
      expect(isIpBlocked("169.254.169.254", 4)).toBe(true);
    });

    it("blocks CGNAT", () => {
      expect(isIpBlocked("100.64.0.1", 4)).toBe(true);
      expect(isIpBlocked("100.127.255.255", 4)).toBe(true);
    });

    it("blocks 0.0.0.0 and ::", () => {
      expect(isIpBlocked("0.0.0.0", 4)).toBe(true);
      expect(isIpBlocked("::", 6)).toBe(true);
    });

    it("allows public IPs", () => {
      expect(isIpBlocked("8.8.8.8", 4)).toBe(false);
      expect(isIpBlocked("1.1.1.1", 4)).toBe(false);
      expect(isIpBlocked("172.32.0.1", 4)).toBe(false); // Outside 172.16/12
      expect(isIpBlocked("192.169.0.1", 4)).toBe(false); // Outside 192.168/16
      expect(isIpBlocked("2001:4860:4860::8888", 6)).toBe(false);
    });
  });

  describe("advisorySsrfCheck", () => {
    it("rejects invalid URLs", async () => {
      await expect(advisorySsrfCheck("not-a-url")).rejects.toThrow(SsrfBlockedError);
    });

    it("rejects non-http/https protocols", async () => {
      await expect(advisorySsrfCheck("ftp://example.com")).rejects.toThrow(/Protocol not allowed/);
      await expect(advisorySsrfCheck("file:///etc/passwd")).rejects.toThrow(/Protocol not allowed/);
    });

    it("rejects embedded credentials", async () => {
      await expect(advisorySsrfCheck("https://user:pass@example.com")).rejects.toThrow(/Embedded credentials/);
    });

    it("allows a safe URL with mocked DNS", async () => {
      const resolveHostname = vi.fn().mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
      await expect(advisorySsrfCheck("https://example.com/webhook", resolveHostname)).resolves.toBeUndefined();
      expect(resolveHostname).toHaveBeenCalledWith("example.com");
    });

    it("blocks if ANY resolved IP is in a blocked range", async () => {
      const resolveHostname = vi.fn().mockResolvedValue([
        { address: "8.8.8.8", family: 4 },
        { address: "192.168.1.10", family: 4 }
      ]);
      await expect(advisorySsrfCheck("https://internal.example.com", resolveHostname)).rejects.toThrow(/blocked network range/);
    });

    it("blocks IP literal hostnames without DNS resolution", async () => {
      const resolveHostname = vi.fn();
      await expect(advisorySsrfCheck("http://127.0.0.1", resolveHostname)).rejects.toThrow(/blocked network range/);
      expect(resolveHostname).not.toHaveBeenCalled();
    });

    it("handles DNS errors gracefully", async () => {
      const resolveHostname = vi.fn().mockRejectedValue(Object.assign(new Error(), { code: "ENOTFOUND" }));
      await expect(advisorySsrfCheck("https://does-not-exist.example.com", resolveHostname)).rejects.toThrow(/Hostname could not be resolved/);
    });
  });
});
