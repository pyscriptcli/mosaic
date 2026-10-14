import {
  RfpFormData,
  PoFormData,
  PcvFormData,
  ClickUpTaskResponse,
  FormType,
} from "@/types/forms/rfp";
import { clickUpFetch as fetch } from "@/lib/clickupCalendarApi";
import { fetchAllClickUpListTasks } from "@/lib/clickupCalendarApi";
import { randomUUID } from "node:crypto";
import { stageMosaicWrite } from "@/lib/mosaicWriteStore";

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

export interface ClickUpContext { token?: string; listId?: string; stageIndex?: number; }

export function getClickUpConfig(overrides: ClickUpContext = {}) {
  const token = overrides.token || process.env.CLICKUP_API_TOKEN || process.env.CLICKUP_TOKEN || "";
  const listId = overrides.listId || process.env.CLICKUP_FORMS_LIST_ID || process.env.CLICKUP_LIST_ID || process.env.CLICKUP_DEFAULT_LIST_ID || "";
  const isConfigured = Boolean(token && listId && token !== "mock" && !token.startsWith("pk_your"));
  return { token, listId, isConfigured };
}

/**
 * Builds a clear, structured Markdown summary of the RFP for the ClickUp task description.
 */
export function buildTaskDescription(data: RfpFormData): string {
  const formattedTotal = Number(data.totalAmount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const methodsDisplay =
    data.paymentMethods && data.paymentMethods.length > 0
      ? data.paymentMethods.map((m) => (m === "online" ? "Online Payment / Bank Transfer" : m.toUpperCase())).join(", ")
      : data.paymentMethod
      ? data.paymentMethod === "online" ? "Online Payment / Bank Transfer" : data.paymentMethod.toUpperCase()
      : "N/A";

  const isUrgent =
    data.urgency === "urgent" || (data.urgencyOptions && data.urgencyOptions.includes("urgent"));
  const urgencyDisplay = isUrgent ? "🚨 URGENT" : "Normal";

  // Clean payment and bank details display
  const bankParts = [
    data.bank && data.bank !== "N/A" ? `Bank: ${data.bank}` : "",
    data.accountName && data.accountName !== "N/A" ? `Acct Name: ${data.accountName}` : "",
    data.accountNumber && data.accountNumber !== "N/A" ? `Acct #: ${data.accountNumber}` : "",
  ].filter(Boolean);

  const paymentDetails =
    bankParts.length > 0 ? `${methodsDisplay} (${bankParts.join(" • ")})` : methodsDisplay;

  const lines = [
    `# 📋 Request for Payment (RFP)`,
    "",
    `| Field | Details |`,
    `| :--- | :--- |`,
    ...((data as any).formRequestId ? [`| **Form ID** | **${(data as any).formRequestId}** |`] : []),
    `| **Total Payable** | **₱${formattedTotal}** |`,
    `| **Payee** | **${data.payee || "N/A"}** |`,
    `| **Department** | ${data.department || "N/A"} |`,
    `| **Date Needed** | **${data.dateNeeded || "N/A"}** (${urgencyDisplay}) |`,
    `| **Payment Details** | ${paymentDetails} |`,
    `| **Purpose** | ${data.purpose ? data.purpose.replace(/\n/g, " ") : "_No purpose stated._"} |`,
    `| **Requested By** | **${data.requestedByName || "N/A"}**${data.requestedByEmail ? ` (${data.requestedByEmail})` : ""} (Date: ${data.date || "N/A"}) |`,
  ];

  return lines.join("\n");
}

/**
 * Builds a clear, structured Markdown summary of the Purchase Order for the ClickUp task description.
 */
export function buildPoTaskDescription(data: PoFormData): string {
  const formattedTotal = Number(data.totalAmountDue || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedSubtotal = Number(data.subtotal || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedVat = Number(data.vatAmount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedEwt = Number(data.withholdingTaxAmount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const isUrgent = data.urgency === "urgent";
  const urgencyDisplay = isUrgent ? "🚨 URGENT" : "Normal";

  const lines = [
    `# 📦 Purchase Order (PO)`,
    "",
    `| Field | Details |`,
    `| :--- | :--- |`,
    ...((data as any).formRequestId ? [`| **Form ID** | **${(data as any).formRequestId}** |`] : []),
    `| **Total Amount Due** | **₱${formattedTotal}** |`,
    `| **Vendor Name** | **${data.vendorName || "N/A"}** |`,
    `| **PO Number** | **${data.poNumber || "N/A"}** |`,
    `| **Department** | ${data.department || "N/A"} |`,
    `| **Date Needed** | **${data.dateNeeded || "N/A"}** (${urgencyDisplay}) |`,
    `| **Vendor TIN** | ${data.tin || "N/A"} |`,
    `| **Contact / Acct Mgr** | ${[data.accountManager, data.contactNo, data.emailAddress].filter(Boolean).join(" • ") || "N/A"} |`,
    `| **Financial Breakdown** | Subtotal: ₱${formattedSubtotal} • VAT (12%): ₱${formattedVat} • EWT (2%): ₱${formattedEwt} |`,
    `| **Notes** | ${data.additionalNotes ? data.additionalNotes.replace(/\n/g, " ") : "_No additional notes._"} |`,
    `| **Prepared By** | **${data.preparedByName || "N/A"}** (Date: ${data.date || "N/A"}) |`,
  ];

  return lines.join("\n");
}

/**
 * Builds a clear, structured Markdown summary of the Petty Cash Voucher for the ClickUp task description.
 */
export function buildPcvTaskDescription(data: PcvFormData): string {
  const formattedAmount = Number(data.amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const isUrgent = data.urgency === "urgent";
  const urgencyDisplay = isUrgent ? "🚨 URGENT" : "Normal";

  const particularsSummary =
    data.particulars && data.particulars.length > 0
      ? data.particulars
          .map(
            (p) =>
              `${p.description || "Item"} (₱${Number(p.amount || 0).toLocaleString("en-US")})`
          )
          .join(" • ")
      : "None listed";

  const lines = [
    `# 💵 Petty Cash Voucher (PCV)`,
    "",
    `| Field | Details |`,
    `| :--- | :--- |`,
    ...((data as any).formRequestId ? [`| **Form ID** | **${(data as any).formRequestId}** |`] : []),
    `| **Amount** | **₱${formattedAmount}** |`,
    `| **Payee (Employee)** | **${data.payee || "N/A"}** |`,
    `| **Department** | ${data.department || "N/A"} |`,
    `| **Voucher No** | **${data.voucherNo || "N/A"}** |`,
    `| **Date** | ${data.date || "N/A"} (${urgencyDisplay}) |`,
    `| **Particulars** | ${particularsSummary} |`,
    `| **Requested By** | **${data.requestedByName || "N/A"}** |`,
  ];

  return lines.join("\n");
}

/**
 * Matches custom fields in the ClickUp list and formats the payload.
 */
async function getMatchingCustomFields(listId: string, token: string, data: RfpFormData, editUrl: string) {
  try {
    const res = await fetch(`${CLICKUP_API_BASE}/list/${listId}/field`, {
      headers: { Authorization: token },
    });
    if (!res.ok) return [];

    const json = await res.json();
    const availableFields: Array<{ id: string; name: string; type: string }> = json.fields || [];

    const customFieldsPayload: Array<{ id: string; value: any }> = [];

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

    availableFields.forEach((field) => {
      const name = normalize(field.name);

      if (name.includes("payee") && data.payee) {
        customFieldsPayload.push({ id: field.id, value: data.payee });
      } else if (name.includes("dept") || name.includes("department")) {
        customFieldsPayload.push({ id: field.id, value: data.department });
      } else if ((name.includes("amount") || name.includes("total")) && data.totalAmount) {
        customFieldsPayload.push({ id: field.id, value: Number(data.totalAmount) });
      } else if (name.includes("purpose") && data.purpose) {
        customFieldsPayload.push({ id: field.id, value: data.purpose });
      } else if (name.includes("urgent") || name.includes("urgency")) {
        customFieldsPayload.push({ id: field.id, value: data.urgency === "urgent" });
      } else if (name.includes("bank") && data.bank) {
        customFieldsPayload.push({ id: field.id, value: data.bank });
      } else if (name.includes("accountname") && data.accountName) {
        customFieldsPayload.push({ id: field.id, value: data.accountName });
      } else if (name.includes("accountnum") && data.accountNumber) {
        customFieldsPayload.push({ id: field.id, value: data.accountNumber });
      } else if (name.includes("requestor") || name.includes("requestedby")) {
        customFieldsPayload.push({ id: field.id, value: data.requestedByName });
      } else if (name.includes("edit") || name.includes("revision") || name.includes("formurl")) {
        customFieldsPayload.push({ id: field.id, value: editUrl });
      }
    });

    return customFieldsPayload;
  } catch (err) {
    console.error("Error fetching ClickUp custom fields:", err);
    return [];
  }
}

/**
 * Creates a new ClickUp Task for the RFP.
 */
export async function createClickUpTask(
  data: any,
  appUrl: string,
  formType: FormType = "rfp"
): Promise<ClickUpTaskResponse> {
  const { token, listId, isConfigured } = getClickUpConfig({ token: data.__clickupToken, listId: data.__clickupListId });

  const isUrgent =
    data.urgency === "urgent" || (data.urgencyOptions && data.urgencyOptions.includes("urgent"));
  const priorityPrefix = isUrgent ? "🚨 [URGENT] " : "";

  let taskName = "";
  let desc = "";

  if (formType === "po" || data.formType === "po") {
    const formattedTotal = Number(data.totalAmountDue || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    taskName = `${priorityPrefix}[PO] ${data.vendorName || "Untitled Vendor"} — ₱${formattedTotal} (${data.department || "Procurement"})`;
    desc = buildPoTaskDescription(data as PoFormData);
  } else if (formType === "pcv" || data.formType === "pcv") {
    const formattedTotal = Number(data.amount || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    taskName = `${priorityPrefix}[PCV] ${data.payee || "Employee"} — ₱${formattedTotal} (${data.department || "General"})`;
    desc = buildPcvTaskDescription(data as PcvFormData);
  } else {
    const formattedTotal = Number(data.totalAmount || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    taskName = `${priorityPrefix}[RFP] ${data.payee || "Untitled Payee"} — ₱${formattedTotal} (${data.department || "General"})`;
    desc = buildTaskDescription(data as RfpFormData);
  }

  if (!isConfigured) {
    const mockId = "MOCK-" + Math.floor(100000 + Math.random() * 900000);
    return {
      id: mockId,
      name: taskName,
      url: `https://app.clickup.com/t/${mockId}`,
      isMock: true,
      status: { status: "for approval", color: "#f59e0b" },
    };
  }

  const priority = isUrgent ? 1 : 3;

  const body: any = {
    name: taskName,
    description: desc,
    markdown_description: desc,
    priority,
    notify_all: true,
  };

  // Sync Due Date to ClickUp if dateNeeded is provided
  if (data.dateNeeded) {
    const dueDateMs = new Date(data.dateNeeded).getTime();
    if (!isNaN(dueDateMs)) {
      body.due_date = dueDateMs;
      body.due_date_time = false;
    }
  }

  const ownerUserId = String(data.__ownerUserId || "");
  if (ownerUserId) {
    const id = randomUUID();
    const recordData = Object.fromEntries(Object.entries(data).filter(([key]) => !key.startsWith("__")));
    await stageMosaicWrite({ token, ownerUserId, domain: "forms", recordId: id, listId, recordData: { ...recordData, id, name: taskName, description: desc } as never, operation: "create", method: "POST", resourcePath: `/list/${listId}/task`, requestBody: body as never });
    return { id, name: taskName, url: "", isMock: false, pendingSync: true } as ClickUpTaskResponse;
  }

  // 1. Create task with initial status "for approval"
  const createRes = await fetch(`${CLICKUP_API_BASE}/list/${listId}/task`, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`ClickUp task creation failed (${createRes.status}): ${errText}`);
  }

  const createdTask = await createRes.json();
  const taskId = createdTask.id;
  const taskUrl = createdTask.url || `https://app.clickup.com/t/${taskId}`;

  return {
    id: taskId,
    name: taskName,
    url: taskUrl,
    isMock: false,
    status: createdTask.status,
  };
}

/**
 * Updates an existing ClickUp Task for a revision.
 */
export async function updateClickUpTask(
  taskId: string,
  data: any,
  appUrl: string,
  formType: FormType = "rfp"
): Promise<ClickUpTaskResponse> {
  const { token, listId, isConfigured } = getClickUpConfig({ token: data.__clickupToken, listId: data.__clickupListId });

  const isUrgent =
    data.urgency === "urgent" || (data.urgencyOptions && data.urgencyOptions.includes("urgent"));
  const priorityPrefix = isUrgent ? "🚨 [URGENT] " : "";

  let taskName = "";
  let desc = "";

  if (formType === "po" || data.formType === "po") {
    const formattedTotal = Number(data.totalAmountDue || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    taskName = `${priorityPrefix}[PO - Revised] ${data.vendorName || "Untitled Vendor"} — ₱${formattedTotal} (${data.department || "Procurement"})`;
    desc = buildPoTaskDescription(data as PoFormData);
  } else if (formType === "pcv" || data.formType === "pcv") {
    const formattedTotal = Number(data.amount || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    taskName = `${priorityPrefix}[PCV - Revised] ${data.payee || "Employee"} — ₱${formattedTotal} (${data.department || "General"})`;
    desc = buildPcvTaskDescription(data as PcvFormData);
  } else {
    const formattedTotal = Number(data.totalAmount || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    taskName = `${priorityPrefix}[RFP - Revised] ${data.payee || "Untitled Payee"} — ₱${formattedTotal} (${data.department || "General"})`;
    desc = buildTaskDescription(data as RfpFormData);
  }

  if (!isConfigured || taskId.startsWith("MOCK-")) {
    return {
      id: taskId,
      name: taskName,
      url: `https://app.clickup.com/t/${taskId}`,
      isMock: true,
      status: { status: "revised", color: "#3b82f6" },
    };
  }

  const priority = isUrgent ? 1 : 3;

  const updateBody: any = {
    name: taskName,
    description: desc,
    markdown_description: desc,
    priority,
  };

  if (data.dateNeeded) {
    const dueDateMs = new Date(data.dateNeeded).getTime();
    if (!isNaN(dueDateMs)) {
      updateBody.due_date = dueDateMs;
      updateBody.due_date_time = false;
    }
  }

  const ownerUserId = String(data.__ownerUserId || "");
  if (ownerUserId) {
    const recordData = Object.fromEntries(Object.entries(data).filter(([key]) => !key.startsWith("__")));
    await stageMosaicWrite({ token, ownerUserId, domain: "forms", recordId: taskId, listId, recordData: { ...recordData, id: taskId, name: taskName, description: desc } as never, operation: "update", method: "PUT", resourcePath: `/task/${taskId}`, requestBody: updateBody as never });
    return { id: taskId, name: taskName, url: "", isMock: false, pendingSync: true } as ClickUpTaskResponse;
  }

  const updateRes = await fetch(`${CLICKUP_API_BASE}/task/${taskId}`, {
    method: "PUT",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updateBody),
  });

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    throw new Error(`ClickUp task update failed (${updateRes.status}): ${errText}`);
  }

  const updated = await updateRes.json();
  return {
    id: taskId,
    name: taskName,
    url: updated.url || `https://app.clickup.com/t/${taskId}`,
    isMock: false,
    status: updated.status,
  };
}

export interface UploadAttachmentResult {
  success: boolean;
  url?: string;
  id?: string;
}

/**
 * Uploads a file attachment to a ClickUp task.
 */
export async function uploadAttachmentToTask(
  taskId: string,
  fileBlob: Blob,
  filename: string,
  context: ClickUpContext = {}
): Promise<UploadAttachmentResult> {
  const { token, isConfigured } = getClickUpConfig(context);

  if (!isConfigured || taskId.startsWith("MOCK-")) {
    console.log(`[Mock Mode] Attachment simulated for task ${taskId}: ${filename}`);
    return { success: true, url: `https://mock.clickup.com/attachments/${filename}` };
  }

  try {
    const formData = new FormData();
    formData.append("attachment", fileBlob, filename);

    const res = await fetch(`${CLICKUP_API_BASE}/task/${taskId}/attachment`, {
      method: "POST",
      headers: {
        Authorization: token,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Failed to upload attachment ${filename}:`, err);
      return { success: false };
    }

    const json = await res.json();
    return { success: true, url: json.url, id: json.id };
  } catch (err) {
    console.error(`Error uploading attachment to task ${taskId}:`, err);
    return { success: false };
  }
}

/**
 * Updates the task description in ClickUp.
 */
export async function updateClickUpTaskDescription(
  taskId: string,
  description: string,
  context: ClickUpContext = {}
): Promise<boolean> {
  const { token, isConfigured } = getClickUpConfig(context);

  if (!isConfigured || taskId.startsWith("MOCK-")) {
    return true;
  }

  try {
    const res = await fetch(`${CLICKUP_API_BASE}/task/${taskId}`, {
      method: "PUT",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description,
        markdown_description: description,
      }),
    });

    return res.ok;
  } catch (err) {
    console.error(`Error updating description for task ${taskId}:`, err);
    return false;
  }
}

/**
 * Retrieves a ClickUp task for revision pre-population.
 */
export async function getClickUpTask(taskId: string, context: ClickUpContext = {}): Promise<any> {
  const { token, isConfigured } = getClickUpConfig(context);

  if (!isConfigured || taskId.startsWith("MOCK-")) {
    return null;
  }

  const res = await fetch(`${CLICKUP_API_BASE}/task/${taskId}?include_markdown_description=true`, {
    headers: { Authorization: token },
  });

  if (!res.ok) {
    return null;
  }

  return await res.json();
}

/**
 * Fetches all tasks from the configured ClickUp list.
 */
export async function getListTasks(includeClosed: boolean = true, context: ClickUpContext = {}): Promise<any[]> {
  const { token, listId, isConfigured } = getClickUpConfig(context);

  if (!isConfigured) {
    return [];
  }

  return fetchAllClickUpListTasks(token, listId, { includeClosed, includeMarkdownDescription: true });
}

/**
 * Posts an audit comment on a ClickUp task.
 */
export async function postTaskComment(taskId: string, commentText: string, context: ClickUpContext = {}): Promise<boolean> {
  const { token, isConfigured } = getClickUpConfig(context);

  if (!isConfigured || taskId.startsWith("MOCK-")) {
    console.log(`[Mock Comment on ${taskId}]: ${commentText}`);
    return true;
  }

  try {
    const res = await fetch(`${CLICKUP_API_BASE}/task/${taskId}/comment`, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        comment_text: commentText,
        notify_all: true,
      }),
    });

    return res.ok;
  } catch (err) {
    console.error(`Error posting comment to task ${taskId}:`, err);
    return false;
  }
}

/**
 * Updates task status to "on going" and checks off the Team Leader checklist item.
 */
export async function approveTaskByApprover(
  taskId: string,
  approverName: string = "Team Leader",
  notes?: string,
  context: ClickUpContext = {}
): Promise<boolean> {
  const { token, isConfigured } = getClickUpConfig(context);

  if (!isConfigured || taskId.startsWith("MOCK-")) {
    return true;
  }

  try {
    const currentTask = await getClickUpTask(taskId, context);
    if (!currentTask) return false;

    let updatedDescription = currentTask.description || currentTask.markdown_description || "";
    // Mark checklist item #1 as checked across RFP, PO, and PCV
    const checklistNumber = Math.max(1, Math.min(5, Number(context.stageIndex ?? 0) + 1));
    updatedDescription = updatedDescription.replace(
      new RegExp(`-\\s*\\[\\s*\\]\\s*(\\*\\*${checklistNumber}\\.[^*]+\\*\\*)`, "i"),
      `- [x] $1 (Approved by ${approverName})`
    );
    // The approver's stage becomes complete; the following stage is now active.
    const nextStage = Math.max(1, Math.min(5, Number(context.stageIndex ?? 0) + 2));
    updatedDescription = updatedDescription.replace(/\n?<!--\s*echo-finance-stage:[^>]+-->/gi, "");
    updatedDescription += `\n<!-- echo-finance-stage:${nextStage};at=${encodeURIComponent(new Date().toISOString())};by=${encodeURIComponent(approverName)} -->`;

    const updateTask = async (body: Record<string, unknown>) => fetch(`${CLICKUP_API_BASE}/task/${taskId}`, {
      method: "PUT",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let updateRes = await updateTask({ status: "on going", description: updatedDescription, markdown_description: updatedDescription });
    if (!updateRes.ok) {
      // Status labels are list-specific in ClickUp. Try the standard equivalent
      // before preserving the approval in the description only.
      await updateRes.text();
      updateRes = await updateTask({ status: "in progress", description: updatedDescription, markdown_description: updatedDescription });
    }
    if (!updateRes.ok) {
      await updateRes.text();
      updateRes = await updateTask({ description: updatedDescription, markdown_description: updatedDescription });
    }
    if (!updateRes.ok) {
      console.error("Failed to update ClickUp task approval status:", await updateRes.text());
      return false;
    }

    const commentMsg = notes
      ? `✅ **Approved by ${approverName}**\nNotes: ${notes}\n\n*Status advanced to Finance Verification.*`
      : `✅ **Approved by ${approverName}**\n\n*Status advanced to Finance Verification.*`;

    await postTaskComment(taskId, commentMsg, context);
    return true;
  } catch (err) {
    console.error(`Error approving task ${taskId}:`, err);
    return false;
  }
}

/**
 * Records an approver or finance revision request and posts instructions to the task.
 */
export async function rejectTaskForRevision(
  taskId: string,
  approverName: string = "Team Leader",
  revisionReason: string,
  actorRole: "tl" | "finance" = "tl",
  context: ClickUpContext = {}
): Promise<boolean> {
  const { token, isConfigured } = getClickUpConfig(context);

  if (!isConfigured || taskId.startsWith("MOCK-")) {
    return true;
  }

  try {
    const roleLabel = actorRole === "finance" ? "Finance & Accounting" : "Team Leader";
    const alertPrefix = `> ⚠️ **Revision Requested by ${roleLabel} (${approverName})**\n> **Reason:** ${revisionReason}\n\n`;

    const currentTask = await getClickUpTask(taskId, context);
    if (currentTask) {
      const existingDesc = currentTask.description || currentTask.markdown_description || "";
      // Strip any previous revision banner if present
      const cleanDesc = existingDesc.replace(
        /^>\s*⚠️\s*\*\*Revision Requested by[^\n]+\n(?:>\s*\*\*Reason:\*\*[^\n]+\n+)?/i,
        ""
      );
      const updatedDescription = alertPrefix + cleanDesc;

      await fetch(`${CLICKUP_API_BASE}/task/${taskId}`, {
        method: "PUT",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: updatedDescription,
          markdown_description: updatedDescription,
        }),
      });
    }

    const commentMsg = `⚠️ **Revision Requested by ${roleLabel} (${approverName})**\n\n**Reason:** ${revisionReason}\n\n*Requestor has been notified to edit and resubmit.*`;
    await postTaskComment(taskId, commentMsg, context);
    return true;
  } catch (err) {
    console.error(`Error requesting revision for task ${taskId}:`, err);
    return false;
  }
}
