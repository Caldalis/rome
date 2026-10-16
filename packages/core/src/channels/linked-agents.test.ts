import { beforeEach, describe, expect, it, rs } from "@rstest/core";
import type { ChannelRecord } from "../db/repositories/channel-records.js";
import { linkedAgentResolver } from "./linked-agents.js";

const warn = rs.hoisted(() => rs.fn());
const info = rs.hoisted(() => rs.fn());

rs.mock("../logger.js", () => ({
  createLogger: () => ({ debug: rs.fn(), info, warn, error: rs.fn() }),
}));

describe("linkedAgentResolver", () => {
  let agent: string | null;
  let loaded: Set<string>;
  let records: Map<string, { service: string; agent: string | null }>;
  const repository = {
    byId: (id: string) => {
      const record = records.get(id);
      return record ? ({ id, ...record } as unknown as ChannelRecord) : null;
    },
  };
  const agents = { has: (name: string) => loaded.has(name) };

  beforeEach(() => {
    agent = "sales:agent";
    loaded = new Set(["sales:agent", "support:agent"]);
    records = new Map();
    warn.mockClear();
    info.mockClear();
  });

  const link = (id: string, service: string) =>
    records.set(id, {
      service,
      get agent() {
        return agent;
      },
    });

  it("reads a linkable channel's agent from its record on each call", () => {
    link("feishu-2", "feishu");
    const linkedAgentOf = linkedAgentResolver(repository, agents);

    expect(linkedAgentOf("feishu-2")).toBe("sales:agent");
    agent = "support:agent";
    expect(linkedAgentOf("feishu-2")).toBe("support:agent");
    agent = "core:main";
    expect(linkedAgentOf("feishu-2")).toBe("core:main");
    agent = null;
    expect(linkedAgentOf("feishu-2")).toBeNull();
  });

  it("reads a channel whose record lands after it was built", () => {
    const linkedAgentOf = linkedAgentResolver(repository, agents);

    expect(linkedAgentOf("c-7f3a")).toBeUndefined();
    link("c-7f3a", "telegram");
    expect(linkedAgentOf("c-7f3a")).toBe("sales:agent");
  });

  it("reads null for a linkable channel no record names", () => {
    expect(linkedAgentResolver(repository, agents)("telegram")).toBeNull();
  });

  it("logs an account with no linked agent once, until it is linked", () => {
    link("feishu-2", "feishu");
    agent = null;
    const linkedAgentOf = linkedAgentResolver(repository, agents);

    expect(linkedAgentOf("feishu-2")).toBeNull();
    expect(linkedAgentOf("feishu-2")).toBeNull();
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(expect.any(String), { channel: "feishu-2" });

    agent = "sales:agent";
    expect(linkedAgentOf("feishu-2")).toBe("sales:agent");
    agent = null;
    expect(linkedAgentOf("feishu-2")).toBeNull();
    expect(info).toHaveBeenCalledTimes(2);
    expect(warn).not.toHaveBeenCalled();
  });

  it("reads null while the linked agent is not loaded, and warns once until it loads", () => {
    link("feishu-2", "feishu");
    const linkedAgentOf = linkedAgentResolver(repository, agents);
    loaded.delete("sales:agent");

    expect(linkedAgentOf("feishu-2")).toBeNull();
    expect(linkedAgentOf("feishu-2")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.any(String), {
      channel: "feishu-2",
      agent: "sales:agent",
    });

    loaded.add("sales:agent");
    expect(linkedAgentOf("feishu-2")).toBe("sales:agent");
    loaded.delete("sales:agent");
    expect(linkedAgentOf("feishu-2")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("reads undefined for a channel of a service that takes no link", () => {
    const linkedAgentOf = linkedAgentResolver(repository, agents);

    for (const name of ["webchat", "email", "agents", "whatsapp"]) {
      expect(linkedAgentOf(name)).toBeUndefined();
    }
  });
});
