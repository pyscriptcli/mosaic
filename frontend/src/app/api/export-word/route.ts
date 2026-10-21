import { NextRequest, NextResponse } from "next/server";
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  Table, 
  TableRow, 
  TableCell, 
  HeadingLevel, 
  WidthType, 
  AlignmentType, 
  BorderStyle,
  ShadingType
} from "docx";
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
    const { meeting_details, items, summary, other_discussions } = await req.json();

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

    // 1. Sleek Top Header Banner (Charcoal with Gold Accent Bottom Border - 1-of-1 PDF Clone)
    const headerTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.SINGLE, size: 14, color: "C9AB4C" },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: "1A1A1A" },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "Minutes of the Meeting",
                      bold: true,
                      italics: true,
                      color: "FFFFFF",
                      size: 24,
                    }),
                  ],
                  spacing: { before: 140, after: 140 },
                }),
              ],
            }),
          ],
        }),
      ],
    });

    // 2. Meeting details
    const sectionHeading = (text: string) => new Paragraph({
      children: [new TextRun({ text, bold: true, italics: true, size: 20, color: "003366" })],
      spacing: { before: 100, after: 80 },
    });

    // Metadata Info Table
    const cellBorderLight = {
      style: BorderStyle.SINGLE,
      size: 1,
      color: "CDD2DA",
    };

    const metaBorders = {
      top: cellBorderLight,
      bottom: cellBorderLight,
      left: cellBorderLight,
      right: cellBorderLight,
    };

    const metaTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 19, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: "PROJECT / CLIENT:", bold: true, size: 17, color: "003366" })] })],
            }),
            new TableCell({
              width: { size: 31, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: clientName, size: 18, color: "23282D" })] })],
            }),
            new TableCell({
              width: { size: 19, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: "MEETING TYPE:", bold: true, size: 17, color: "003366" })] })],
            }),
            new TableCell({
              width: { size: 31, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: typeStr, size: 18, color: "23282D" })] })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 19, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: "DATE & TIME:", bold: true, size: 17, color: "003366" })] })],
            }),
            new TableCell({
              width: { size: 31, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: dateTimeStr, size: 18, color: "23282D" })] })],
            }),
            new TableCell({
              width: { size: 19, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: "TEAM ATTENDEES:", bold: true, size: 17, color: "003366" })] })],
            }),
            new TableCell({
              width: { size: 31, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: teamAtt, size: 18, color: "23282D" })] })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 19, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: "VENUE / LOCATION:", bold: true, size: 17, color: "003366" })] })],
            }),
            new TableCell({
              width: { size: 31, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: locationStr, size: 18, color: "23282D" })] })],
            }),
            new TableCell({
              width: { size: 19, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: "EXTERNAL ATTENDEES:", bold: true, size: 17, color: "003366" })] })],
            }),
            new TableCell({
              width: { size: 31, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: extAtt, size: 18, color: "23282D" })] })],
            }),
          ],
        }),
      ],
    });

    // 3. Summary
    const summaryText = cleanField(summary);

    const summaryTable = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: "DCDFE3" },
            right: { style: BorderStyle.SINGLE, size: 4, color: "DCDFE3" },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: "DCDFE3" },
            left: { style: BorderStyle.SINGLE, size: 24, color: "C9AB4C" },
            insideHorizontal: { style: BorderStyle.NONE },
            insideVertical: { style: BorderStyle.NONE },
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  shading: { type: ShadingType.CLEAR, fill: "FAF9F7" },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "SUMMARY",
                          bold: true,
                          color: "003366",
                          size: 17,
                        }),
                      ],
                      spacing: { before: 100, after: 60 },
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: summaryText || "No summary provided.",
                          color: "374151",
                          size: 18,
                        }),
                      ],
                      spacing: { after: 100 },
                    }),
                  ],
                }),
              ],
            }),
          ],
        });

    // 4. Minutes Items Table: Columns [#, Discussion Point, Action Plan, Delivery Date, Person in Charge]
    const gridBorder = {
      style: BorderStyle.SINGLE,
      size: 2,
      color: "DCDFE3",
    };

    const tableHeader = new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: "003366" },
          borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "#", bold: true, color: "FFFFFF", size: 19 })] })],
          width: { size: 5, type: WidthType.PERCENTAGE }
        }),
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: "003366" },
          borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder },
          children: [new Paragraph({ children: [new TextRun({ text: "Discussion Point", bold: true, color: "FFFFFF", size: 19 })] })],
          width: { size: 95, type: WidthType.PERCENTAGE }
        }),
      ]
    });

    const tableRows: TableRow[] = [tableHeader];

    (items || []).forEach((item: any, idx: number) => {
      const isAlt = idx % 2 === 1;
      const rowFill = isAlt ? "FAF9F7" : "FFFFFF";

      const topic = cleanField(item.topic_title);
      const disc = cleanField(item.discussion_point);
      const topicParagraphs: Paragraph[] = [];

      if (topic) {
        topicParagraphs.push(new Paragraph({
          children: [new TextRun({ text: topic, bold: true, color: "003366", size: 19 })],
          spacing: { after: disc ? 60 : 0 }
        }));
      }
      if (disc) {
        topicParagraphs.push(new Paragraph({
          children: [new TextRun({ text: disc, size: 18, color: "333333" })]
        }));
      }
      if (topicParagraphs.length === 0) {
        topicParagraphs.push(new Paragraph({ text: "" }));
      }
      // Note: evidence_quote is completely removed (soft copy only)

      tableRows.push(new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: rowFill },
            borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(idx + 1), bold: true, color: "C9AB4C", size: 19 })] })]
          }),
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: rowFill },
            borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder },
            children: topicParagraphs
          }),
        ]
      }));
    });

    const actionItems = (items || []).filter((item: any) => cleanField(item.action_plan));
    const actionRows: TableRow[] = [new TableRow({
      tableHeader: true,
      children: ["Action Item", "Due Date", "Person in Charge", "Related Discussion"].map((label) => new TableCell({
        shading: { type: ShadingType.CLEAR, fill: "003366" },
        borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, color: "FFFFFF", size: 19 })] })],
      })),
    })];
    actionItems.forEach((item: any, index: number) => {
      const rowFill = index % 2 ? "FAF9F7" : "FFFFFF";
      const cells = [cleanField(item.action_plan), cleanField(item.indicative_delivery_date), cleanField(item.person_in_charge), cleanField(item.topic_title || item.discussion_point)];
      actionRows.push(new TableRow({
        children: cells.map((value) => new TableCell({
          shading: { type: ShadingType.CLEAR, fill: rowFill },
          borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder },
          children: [new Paragraph({ children: [new TextRun({ text: value, size: 18, color: "333333" })] })],
        })),
      }));
    });
    const docChildren: any[] = [
      headerTable,
      new Paragraph({ text: "", spacing: { after: 150 } }),
      sectionHeading("MEETING DETAILS"),
      metaTable,
      new Paragraph({ text: "", spacing: { after: 150 } }),
      sectionHeading("SUMMARY"),
      summaryTable,
      new Paragraph({ text: "", spacing: { after: 150 } }),
      sectionHeading("DISCUSSION POINTS"),
      new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
      new Paragraph({ text: "", spacing: { after: 200 } }),
      ...(actionItems.length > 0 ? [
        sectionHeading("ACTION ITEMS"),
        new Table({ rows: actionRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
        new Paragraph({ text: "", spacing: { after: 200 } }),
      ] : []),
      sectionHeading("OTHER DISCUSSIONS"),
      new Paragraph({
        children: [new TextRun({ text: cleanField(other_discussions) || "None recorded.", size: 18, color: "333333" })],
        spacing: { after: 250 },
      }),
    ];
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 720,
              bottom: 720,
              left: 720,
              right: 720,
            }
          }
        },
        children: docChildren,
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const safeClient = clientName || "Meeting";
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="MoM_${safeClient.replace(/\s+/g, "_")}.docx"`,
      }
    });
  } catch (error: any) {
    console.error("Error generating executive Word doc:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
