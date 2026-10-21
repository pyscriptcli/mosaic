import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { requireFeature } from "@/lib/access-control-server";
import { formatEchoTime } from "@/lib/dateUtils";

function cleanField(val: any): string {
  if (!val) return "";
  const s = String(val).trim();
  const lower = s.toLowerCase();
  if (
    lower === "none" ||
    lower === "n/a" ||
    lower === "tbd" ||
    lower === "unassigned" ||
    lower === "null" ||
    lower === "undefined"
  ) {
    return "";
  }
  return s;
}

function formatDiscussionText(val: any): string {
  return cleanField(val).replace(/\\+\*/g, "*").split(/\r?\n/).map((line) => {
    const normalized = line.replace(/\\-/g, "-");
    const bullet = normalized.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    return `${bullet ? "• " : ""}${bullet ? bullet[1] : normalized}`;
  }).join("\n");
}

function plainDiscussionText(value: string): string {
  return value.replace(/\*\*([^*]+)\*\*/g, "$1");
}

function boldRanges(value: string): { start: number; end: number }[] {
  let position = 0;
  return value.replace(/\\+\*/g, "*").split("\n").flatMap((line) => {
    const ranges: { start: number; end: number }[] = [];
    const normalized = line.replace(/\\-/g, "-");
    const bullet = normalized.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    const content = `${bullet ? "• " : ""}${bullet ? bullet[1] : normalized}`;
    let removed = 0;
    for (const match of content.matchAll(/\*\*([^*]+)\*\*/g)) {
      const start = position + (match.index || 0) - removed;
      const phrase = match[1];
      ranges.push({ start, end: start + phrase.length });
      removed += 4;
    }
    position += plainDiscussionText(content).length + 1;
    return ranges;
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireFeature(req, "meetings-export");
  if (denied) return denied;
  try {
    const { meeting_details, discussion_points = [], action_items = [], summary, other_discussions } = await req.json();

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    doc.setLineHeightFactor(1.15);

    const pageWidth = doc.internal.pageSize.getWidth();

    // 2. Document Metadata Preparation (Blank fields stay blank, no defaults/hints)
    const clientName = cleanField(meeting_details?.client_name);
    const dateStr = cleanField(meeting_details?.date);
    const startT = formatEchoTime(cleanField(meeting_details?.start_time));
    const endT = formatEchoTime(cleanField(meeting_details?.end_time));
    let timeStr = "";
    if (startT && endT) {
      timeStr = `${startT} - ${endT}`;
    } else if (startT || endT) {
      timeStr = startT || endT;
    }
    const dateTimeStr = dateStr && timeStr ? `${dateStr} (${timeStr})` : (dateStr || timeStr);
    const locationStr = cleanField(meeting_details?.location);
    const typeStr = cleanField(meeting_details?.meeting_type);
    const teamAtt = cleanField(meeting_details?.team_attendees || meeting_details?.prime_attendees);
    const extAtt = cleanField(meeting_details?.external_attendees);

    // Editorial masthead: a quiet project kicker, large serif title, and gold rule.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(0, 51, 102);
    doc.text([clientName, dateStr].filter(Boolean).join("  ·  ") || "MEETING RECORD", 22, 18);
    doc.setFont("times", "normal");
    doc.setFontSize(30);
    doc.text("Minutes of the Meeting", 22, 33);
    doc.setDrawColor(201, 168, 76);
    doc.setLineWidth(0.35);
    doc.line(22, 39, pageWidth - 22, 39);

    doc.setFont("times", "bolditalic");
    doc.setFontSize(16);
    doc.setTextColor(0, 51, 102);
    doc.text("MEETING DETAILS", 22, 49);
    const metaStartY = 54;
    const metaBody = [
      ["PROJECT / CLIENT:", clientName, "MEETING TYPE:", typeStr],
      ["DATE & TIME:", dateTimeStr, "TEAM ATTENDEES:", teamAtt],
      ["VENUE / LOCATION:", locationStr, "EXTERNAL ATTENDEES:", extAtt],
    ];

    autoTable(doc, {
      startY: metaStartY,
      margin: { left: 22, right: 22, bottom: 16 },
      body: metaBody,
      theme: "plain",
      styles: {
        fontSize: 9,
        cellPadding: { top: 2.8, bottom: 2.8, left: 2, right: 2 },
        overflow: "linebreak",
        valign: "top",
        textColor: [27, 29, 30],
        fillColor: [255, 252, 251],
      },
      columnStyles: {
        0: { cellWidth: 28, fontStyle: "bold", textColor: [0, 51, 102] },
        1: { cellWidth: 55, textColor: [24, 29, 30] },
        2: { cellWidth: 28, fontStyle: "bold", textColor: [0, 51, 102] },
        3: { cellWidth: 55, textColor: [24, 29, 30] },
      },
    });

    const metaFinalY = (doc as any).lastAutoTable?.finalY || (metaStartY + 24);

    // Draw container card boundary cleanly wrapping the calculated height
    doc.setDrawColor(220, 224, 227);
    doc.setLineWidth(0.2);
    doc.line(22, metaFinalY + 1, pageWidth - 22, metaFinalY + 1);

    const summaryParagraphs = cleanField(summary).split(/\r?\n\s*\r?\n/).filter(Boolean);

    const summaryLabelY = metaFinalY + 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(0, 51, 102);
    doc.text("SUMMARY", 25, summaryLabelY);
    const summaryStartY = summaryLabelY + 4;
    let tableStartY = summaryStartY + 1;
    const summaryRows = [[summaryParagraphs[0] || "No summary provided."], ...(summaryParagraphs[1] ? [[`Bottom line: ${summaryParagraphs[1]}`]] : [])];
    autoTable(doc, {
      startY: tableStartY,
      margin: { left: 26, right: 30, bottom: 16 },
      body: summaryRows,
      theme: "plain",
      bodyStyles: { fillColor: [255, 252, 251], textColor: [24, 29, 30], fontSize: 10, cellPadding: { top: 2, right: 2, bottom: 3, left: 2 }, overflow: "linebreak", halign: "left", valign: "top" },
      styles: { lineColor: [255, 252, 251], lineWidth: 0, font: "times" },
    });
    const summaryFinalY = (doc as any).lastAutoTable?.finalY || (tableStartY + 18);
    doc.setDrawColor(201, 168, 76);
    doc.setLineWidth(0.8);
    doc.line(22, summaryStartY, 22, summaryFinalY - 1);
    tableStartY = summaryFinalY + 12;

    if (tableStartY > 260) {
      doc.addPage();
      tableStartY = 24;
    }
    doc.setFont("times", "italic");
    doc.setFontSize(18);
    doc.setTextColor(0, 51, 102);
    doc.text("DISCUSSION POINTS", 22, tableStartY);
    tableStartY += 9;

    (discussion_points || []).forEach((item: any, index: number) => {
      const topic = cleanField(item.topic_title) || `Discussion ${index + 1}`;
      const sourceDiscussion = cleanField(item.discussion_point) || "No discussion details recorded.";
      const markedDiscussion = formatDiscussionText(sourceDiscussion);
      const discussionPoint = plainDiscussionText(markedDiscussion);
      const emphasisRanges = boldRanges(sourceDiscussion);
      autoTable(doc, {
        startY: tableStartY,
        margin: { left: 22, right: 22, bottom: 16 },
        head: [[topic]],
        body: [[discussionPoint]],
        theme: "plain",
        headStyles: { fillColor: [255, 252, 251], textColor: [0, 51, 102], fontStyle: "bold", fontSize: 15, halign: "left", cellPadding: { top: 4, right: 1, bottom: 2, left: 1 } },
        bodyStyles: { fillColor: [255, 252, 251], textColor: [24, 29, 30], fontSize: 10, cellPadding: { top: 2, right: 1, bottom: 7, left: 1 }, overflow: "linebreak", halign: "left", valign: "top" },
        styles: { lineColor: [255, 252, 251], lineWidth: 0, valign: "top", font: "helvetica" },
        didParseCell: (data: any) => {
          if (data.section === "body" && emphasisRanges.length) data.cell.styles.textColor = [24, 29, 30];
        },
        didDrawCell: (data: any) => {
          if (data.section !== "body" || !emphasisRanges.length) return;
          const lines: string[] = Array.isArray(data.cell.text) ? data.cell.text : [String(data.cell.text || "")];
          const left = data.cell.x + data.cell.padding("left");
          const fontSize = data.cell.styles.fontSize || 10;
          const lineHeight = fontSize * 0.3528 * 1.15;
          let y = data.cell.y + data.cell.padding("top") + fontSize * 0.3528;
          let searchFrom = 0;
          lines.forEach((line) => {
            const start = discussionPoint.indexOf(line, searchFrom);
            if (start < 0) return;
            const end = start + line.length;
            const boundaries = new Set([start, end]);
            emphasisRanges.forEach((range) => {
              if (range.start < end && range.end > start) {
                boundaries.add(Math.max(start, range.start));
                boundaries.add(Math.min(end, range.end));
              }
            });
            const positions = [...boundaries].sort((a, b) => a - b);
            let x = left;
            for (let index = 0; index < positions.length - 1; index += 1) {
              const pieceStart = positions[index];
              const pieceEnd = positions[index + 1];
              const emphasized = emphasisRanges.some((range) => range.start <= pieceStart && range.end >= pieceEnd);
              const piece = discussionPoint.slice(pieceStart, pieceEnd);
              doc.setFont("helvetica", emphasized ? "bold" : "normal");
              doc.setFontSize(fontSize);
              doc.setTextColor(24, 29, 30);
              doc.text(piece, x, y);
              x += doc.getTextWidth(piece);
            }
            searchFrom = end;
            y += lineHeight;
          });
        },
      });
      // @ts-ignore
      tableStartY = ((doc as any).lastAutoTable?.finalY || (tableStartY + 18)) + 4;
    });

    let currentY = tableStartY + 5;

    const actions = (action_items || []).filter((item: any) => cleanField(item.action_plan));
    if (actions.length > 0) {
      doc.setFont("times", "bolditalic");
      doc.setFontSize(12);
      doc.setTextColor(0, 51, 102);
      if (currentY > 260) {
        doc.addPage();
        currentY = 20;
      }
      doc.text("ACTION ITEMS", 16, currentY);
      currentY += 7;
      autoTable(doc, {
        startY: currentY,
        margin: { left: 22, right: 22, bottom: 16 },
        head: [["Discussion Point", "Action Plan", "Target Date", "Person in Charge"]],
        body: actions.map((item: any) => [
          [cleanField(item.discussion_point_title || item.topic_title), plainDiscussionText(formatDiscussionText(item.discussion_point))].filter(Boolean).join("\n"),
          cleanField(item.action_plan), cleanField(item.target_date || item.indicative_delivery_date), cleanField(item.person_in_charge),
        ]),
        theme: "plain",
        headStyles: { fillColor: [255, 252, 251], textColor: [0, 51, 102], fontStyle: "bold", fontSize: 8, halign: "left", lineColor: [0, 51, 102], lineWidth: { bottom: 0.5 } },
        columnStyles: { 0: { cellWidth: 44 }, 1: { cellWidth: 50 }, 2: { cellWidth: 30 }, 3: { cellWidth: 42 } },
        bodyStyles: { fillColor: [255, 252, 251], textColor: [24, 29, 30], halign: "left", valign: "top" },
        styles: { fontSize: 9, cellPadding: { top: 3.5, right: 2, bottom: 5, left: 2 }, overflow: "linebreak", lineColor: [220, 224, 227], lineWidth: { bottom: 0.2 }, halign: "left", valign: "top" },
      });
      // @ts-ignore
      currentY = (doc as any).lastAutoTable?.finalY || (currentY + 12);
      currentY += 8;
    }

    // Other discussions follow the action items.
    const otherDiscussionsText = cleanField(other_discussions);
    {
      autoTable(doc, {
        startY: currentY,
        margin: { left: 22, right: 22, bottom: 16 },
        head: [["OTHER DISCUSSIONS"]],
        body: [[otherDiscussionsText || "None recorded."]],
        theme: "plain",
        headStyles: { fillColor: [255, 252, 251], textColor: [0, 51, 102], fontStyle: "bold", fontSize: 14, halign: "left", cellPadding: { top: 3, right: 0, bottom: 2, left: 0 } },
        bodyStyles: { fillColor: [255, 252, 251], textColor: [24, 29, 30], fontSize: 10, cellPadding: { top: 1, right: 0, bottom: 2, left: 0 }, overflow: "linebreak", halign: "left", valign: "top" },
        styles: { lineColor: [255, 252, 251], lineWidth: 0 },
      });
    }

    const buffer = Buffer.from(doc.output("arraybuffer"));
    const safeClient = clientName || "Meeting";
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="MoM_${safeClient.replace(/\s+/g, "_")}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("Error generating executive PDF:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
