import { describe, expect, it } from "vitest";
import { addMosaicSyncMarker, mergeStagedClickUpTasks } from "@/lib/mosaicWriteStore";

describe("addMosaicSyncMarker", () => {
  it("keeps JSON task descriptions parseable for existing record readers", () => {
    const marked = addMosaicSyncMarker('{"echoDemand":{"client":"Northwind"}}', "request-1");

    expect(JSON.parse(marked)).toMatchObject({
      echoDemand: { client: "Northwind" },
      _mosaicSyncRequest: "request-1",
    });
  });

  it("uses an HTML comment marker for plain-text task descriptions", () => {
    expect(addMosaicSyncMarker("Meeting notes", "request-2")).toContain("<!-- mosaic-sync-request:request-2 -->");
  });
});

describe("mergeStagedClickUpTasks", () => {
  it("overlays a saved local edit while ClickUp catches up", () => {
    const tasks = mergeStagedClickUpTasks(
      [{ id: "cu-1", name: "Old title", status: { status: "to do" } }],
      [{
        record_id: "cu-1",
        clickup_id: "cu-1",
        list_id: "123",
        sync_state: "pending",
        is_deleted: false,
        record_data: { id: "cu-1", name: "New title", status: "in progress" },
      }],
    );

    expect(tasks).toMatchObject([{ id: "cu-1", name: "New title", status: { status: "in progress" }, list: { id: "123" }, _mosaicSyncState: "pending" }]);
  });

  it("includes a staged create with its local id", () => {
    const tasks = mergeStagedClickUpTasks([], [{
      record_id: "local-1",
      clickup_id: null,
      sync_state: "pending",
      is_deleted: false,
      record_data: { id: "local-1", name: "New task" },
    }]);

    expect(tasks).toMatchObject([{ id: "local-1", name: "New task", _mosaicSyncState: "pending" }]);
  });

  it("hides a staged delete immediately", () => {
    const tasks = mergeStagedClickUpTasks(
      [{ id: "cu-1", name: "Deleted task" }],
      [{ record_id: "local-1", clickup_id: "cu-1", is_deleted: true, record_data: {} }],
    );

    expect(tasks).toEqual([]);
  });
});
