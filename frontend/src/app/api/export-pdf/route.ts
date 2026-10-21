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
    return `${bullet ? "• " : ""}${(bullet ? bullet[1] : normalized).replace(/\*\*([^*]+)\*\*/g, "$1")}`;
  }).join("\n");
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

    // 1. Smaller, sleek Header Banner (Height: 11mm, Deep Charcoal #1A1A1A)
    const bannerHeight = 11;
    doc.setFillColor(26, 26, 26);
    doc.rect(0, 0, pageWidth, bannerHeight, "F");

    // Gold Accent Border (#C9AB4C)
    doc.setFillColor(201, 171, 76);
    doc.rect(0, bannerHeight, pageWidth, 0.8, "F");

    // Header branding text: “Minutes of the Meeting”.
    doc.setTextColor(255, 255, 255);
    doc.setFont("times", "bolditalic");
    doc.setFontSize(12);
    doc.text("Minutes of the Meeting", 14, 7.5);

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

    // 3. Auto-Adjusting Meeting Details Container
    // Uses autoTable to dynamically compute row heights & line breaks without overlapping
    doc.setFont("times", "bolditalic");
    doc.setFontSize(11);
    doc.setTextColor(0, 51, 102);
    doc.text("MEETING DETAILS", 14, 14);
    const metaStartY = 18;
    const metaBody = [
      ["PROJECT / CLIENT:", clientName, "MEETING TYPE:", typeStr],
      ["DATE & TIME:", dateTimeStr, "TEAM ATTENDEES:", teamAtt],
      ["VENUE / LOCATION:", locationStr, "EXTERNAL ATTENDEES:", extAtt],
    ];

    autoTable(doc, {
      startY: metaStartY,
      margin: { left: 14, right: 14 },
      body: metaBody,
      theme: "plain",
      styles: {
        fontSize: 7.8,
        cellPadding: { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 },
        overflow: "linebreak",
        valign: "top",
        textColor: [27, 29, 30],
        fillColor: [248, 246, 242], // Light warm container fill
      },
      columnStyles: {
        0: { cellWidth: 34, fontStyle: "bold", textColor: [0, 51, 102] },
        1: { cellWidth: 57, textColor: [35, 40, 45] },
        2: { cellWidth: 34, fontStyle: "bold", textColor: [0, 51, 102] },
        3: { cellWidth: 57, textColor: [35, 40, 45] },
      },
    });

    const metaFinalY = (doc as any).lastAutoTable?.finalY || (metaStartY + 24);

    // Draw container card boundary cleanly wrapping the calculated height
    doc.setDrawColor(205, 210, 218);
    doc.setLineWidth(0.3);
    doc.rect(14, metaStartY, pageWidth - 28, metaFinalY - metaStartY, "S");

    const summaryParagraphs = cleanField(summary).split(/\r?\n\s*\r?\n/).filter(Boolean);

    const summaryStartY = metaFinalY + 4;
    doc.setFont("times", "bolditalic");
    doc.setFontSize(11);
    doc.setTextColor(0, 51, 102);
    doc.text("SUMMARY", 14, summaryStartY + 3);
    let tableStartY = summaryStartY + 7;

    {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.8);
      const summaryLines = doc.splitTextToSize(summaryParagraphs[0] || "No summary provided.", pageWidth - 38);
      const bottomLines = summaryParagraphs[1] ? doc.splitTextToSize(summaryParagraphs[1], pageWidth - 38) : [];
      const summaryBoxStartY = summaryStartY + 6;
      const summaryBoxHeight = Math.max(12, (summaryLines.length * 3.8) + (bottomLines.length ? bottomLines.length * 3.8 + 12 : 8));

      doc.setFillColor(250, 249, 247);
      doc.rect(14, summaryBoxStartY, pageWidth - 28, summaryBoxHeight, "F");
      doc.setDrawColor(220, 225, 230);
      doc.rect(14, summaryBoxStartY, pageWidth - 28, summaryBoxHeight, "S");

      // Gold accent on left edge
      doc.setFillColor(201, 171, 76);
      doc.rect(14, summaryBoxStartY, 2, summaryBoxHeight, "F");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.8);
      doc.setTextColor(55, 65, 81);
      doc.text(summaryLines, 19, summaryBoxStartY + 5, { align: "justify" });
      if (bottomLines.length) {
        const bottomY = summaryBoxStartY + 7 + summaryLines.length * 3.8;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 51, 102);
        doc.text("Bottom line:", 19, bottomY);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(55, 65, 81);
        doc.text(bottomLines, 19, bottomY + 3.8, { align: "justify" });
      }

      tableStartY = summaryBoxStartY + summaryBoxHeight + 5;
    }

    doc.setFont("times", "bolditalic");
    doc.setFontSize(11);
    doc.setTextColor(0, 51, 102);
    doc.text("DISCUSSION POINTS", 14, tableStartY);
    tableStartY += 4;

    (discussion_points || []).forEach((item: any, index: number) => {
      const topic = cleanField(item.topic_title) || `Discussion ${index + 1}`;
      const sourceDiscussion = cleanField(item.discussion_point) || "No discussion details recorded.";
      const discussionPoint = formatDiscussionText(sourceDiscussion);
      autoTable(doc, {
        startY: tableStartY,
        head: [[topic]],
        body: [[discussionPoint]],
        theme: "grid",
        headStyles: { fillColor: [250, 249, 247], textColor: [0, 51, 102], fontStyle: "bold", fontSize: 9 },
        bodyStyles: { fillColor: [255, 255, 255], textColor: [50, 50, 50], fontSize: 8, cellPadding: 3.5, overflow: "linebreak", halign: "justify" },
        styles: { lineColor: [220, 225, 230], lineWidth: 0.2 },
        didParseCell: (data: any) => {
          if (data.section === "body" && sourceDiscussion.replace(/\\+\*/g, "*").includes("**")) data.cell.styles.fontStyle = "bold";
        },
      });
      // @ts-ignore
      tableStartY = ((doc as any).lastAutoTable?.finalY || (tableStartY + 18)) + 3;
    });

    let currentY = tableStartY + 5;

    const actions = (action_items || []).filter((item: any) => cleanField(item.action_plan));
    if (actions.length > 0) {
      doc.setFont("times", "bolditalic");
      doc.setFontSize(11);
      doc.setTextColor(0, 51, 102);
      doc.text("ACTION ITEMS", 14, currentY);
      currentY += 4;
      autoTable(doc, {
        startY: currentY,
        head: [["Discussion Point", "Action Plan", "Target Date", "Person in Charge"]],
        body: actions.map((item: any) => [
          [cleanField(item.discussion_point_title || item.topic_title), formatDiscussionText(item.discussion_point)].filter(Boolean).join("\n"),
          cleanField(item.action_plan), cleanField(item.target_date || item.indicative_delivery_date), cleanField(item.person_in_charge),
        ]),
        theme: "grid",
        headStyles: { fillColor: [0, 51, 102], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
        columnStyles: { 0: { cellWidth: 68 }, 1: { cellWidth: 55 }, 2: { cellWidth: 27 }, 3: { cellWidth: 32 } },
        styles: { cellPadding: 3, overflow: "linebreak", lineColor: [220, 225, 230], lineWidth: 0.2, halign: "justify" },
      });
      // @ts-ignore
      currentY = (doc as any).lastAutoTable?.finalY || (currentY + 12);
      currentY += 8;
    }

    // Other discussions follow the action items.
    const otherDiscussionsText = cleanField(other_discussions);
    {
      if (currentY > 235) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFillColor(0, 51, 102);
      doc.rect(14, currentY, 3, 6, "F");

      doc.setFont("times", "bolditalic");
      doc.setFontSize(11);
      doc.setTextColor(0, 51, 102);
      doc.text("OTHER DISCUSSIONS", 20, currentY + 4.8);

      currentY += 9;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(50, 50, 50);
      const splitOther = doc.splitTextToSize(otherDiscussionsText || "None recorded.", pageWidth - 28);
      doc.text(splitOther, 14, currentY, { align: "justify" });
      currentY += (splitOther.length * 4) + 6;
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
