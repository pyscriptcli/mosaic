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

export async function POST(req: NextRequest) {
  const denied = await requireFeature(req, "meetings-export");
  if (denied) return denied;
  try {
    const { meeting_details, items, other_discussions } = await req.json();

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

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
    const metaStartY = 15;
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

    // 4. Executive Summary Box (Auto-adjusting height)
    let summaryText = "";
    if (items && items.length > 0) {
      const pointSummaries = items
        .map((it: any) => {
          const disc = cleanField(it.discussion_point);
          if (!disc) return "";
          const firstSentence = disc.split(/\.\s+/)[0];
          return firstSentence.endsWith(".") ? firstSentence : `${firstSentence}.`;
        })
        .filter(Boolean);

      if (pointSummaries.length > 0) {
        summaryText = pointSummaries.slice(0, 3).join(" ");
        if (!summaryText.endsWith(".")) summaryText += ".";
      }
    }

    const summaryStartY = metaFinalY + 4;
    let tableStartY = summaryStartY;

    if (summaryText) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.8);
      const summaryLines = doc.splitTextToSize(summaryText, pageWidth - 38);
      const summaryBoxHeight = Math.max(12, (summaryLines.length * 3.8) + 8);

      doc.setFillColor(250, 249, 247);
      doc.rect(14, summaryStartY, pageWidth - 28, summaryBoxHeight, "F");
      doc.setDrawColor(220, 225, 230);
      doc.rect(14, summaryStartY, pageWidth - 28, summaryBoxHeight, "S");

      // Gold accent on left edge
      doc.setFillColor(201, 171, 76);
      doc.rect(14, summaryStartY, 2, summaryBoxHeight, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(0, 51, 102);
      doc.text("EXECUTIVE SUMMARY", 19, summaryStartY + 4.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.8);
      doc.setTextColor(55, 65, 81);
      doc.text(summaryLines, 19, summaryStartY + 8.5);

      tableStartY = summaryStartY + summaryBoxHeight + 4;
    }

    // 5. Discussion Points Table Data (Evidence removed - soft copy only)
    const tableData = (items || []).map((item: any, index: number) => {
      const topic = cleanField(item.topic_title);
      const disc = cleanField(item.discussion_point);
      let topicCell = topic;
      if (disc) {
        topicCell = topicCell ? `${topicCell}\n\n${disc}` : disc;
      }
      return [
        String(index + 1),
        topicCell,
        cleanField(item.action_plan),
        cleanField(item.indicative_delivery_date),
        cleanField(item.person_in_charge),
      ];
    });

    autoTable(doc, {
      startY: tableStartY,
      head: [["#", "Discussion Point", "Action Plan", "Delivery Date", "Person in Charge"]],
      body: tableData,
      theme: "grid",
      headStyles: {
        fillColor: [0, 51, 102],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.5,
        halign: "left",
      },
      columnStyles: {
        0: { cellWidth: 9, halign: "center", fontStyle: "bold", textColor: [201, 171, 76] },
        1: { cellWidth: 82, fontSize: 8 },
        2: { cellWidth: 43, fontSize: 8 },
        3: { cellWidth: 24, fontSize: 8 },
        4: { cellWidth: 24, fontSize: 8 },
      },
      styles: {
        cellPadding: 3,
        overflow: "linebreak",
        lineColor: [220, 225, 230],
        lineWidth: 0.2,
      },
      alternateRowStyles: {
        fillColor: [250, 249, 247],
      },
    });

    // @ts-ignore
    let currentY = (doc as any).lastAutoTable?.finalY || (tableStartY + 36);
    currentY += 8;

    // 6. Other Discussions Section
    const otherDiscussionsText = cleanField(other_discussions);
    if (otherDiscussionsText) {
      if (currentY > 235) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFillColor(0, 51, 102);
      doc.rect(14, currentY, 3, 6, "F");

      doc.setFont("times", "bolditalic");
      doc.setFontSize(11);
      doc.setTextColor(0, 51, 102);
      doc.text("Other Discussions & Administrative Notes", 20, currentY + 4.8);

      currentY += 9;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(50, 50, 50);
      const splitOther = doc.splitTextToSize(otherDiscussionsText, pageWidth - 28);
      doc.text(splitOther, 14, currentY);
      currentY += (splitOther.length * 4) + 6;
    }

    // 7. Signatures / Confirmation Block
    if (currentY > 245) {
      doc.addPage();
      currentY = 25;
    } else {
      currentY += 6;
    }

    const prepBy = cleanField(meeting_details?.prepared_by);
    const confBy = cleanField(meeting_details?.confirmed_by);
    const prepDes = cleanField(meeting_details?.prep_designation);
    const confDes = cleanField(meeting_details?.conf_designation);

    doc.setDrawColor(201, 171, 76);
    doc.line(14, currentY, pageWidth - 14, currentY);
    currentY += 7;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(0, 51, 102);
    doc.text("PREPARED BY:", 18, currentY);
    doc.text("CONFIRMED BY:", 110, currentY);

    currentY += 12;
    doc.setDrawColor(180, 180, 180);
    doc.line(18, currentY, 80, currentY);
    doc.line(110, currentY, 175, currentY);

    if (prepBy || confBy) {
      currentY += 4.5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(27, 29, 30);
      if (prepBy) doc.text(prepBy, 18, currentY);
      if (confBy) doc.text(confBy, 110, currentY);
    }

    if (prepDes || confDes) {
      currentY += 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 100, 100);
      if (prepDes) doc.text(prepDes, 18, currentY);
      if (confDes) doc.text(confDes, 110, currentY);
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
