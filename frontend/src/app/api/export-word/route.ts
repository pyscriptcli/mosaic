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
    const { meeting_details, items, other_discussions } = await req.json();

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

    // 2. Metadata Info Table (Identical 4 columns and styling to PDF)
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

    // 3. Executive Summary Box (1-of-1 PDF Clone)
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

    const summaryTable = summaryText
      ? new Table({
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
                          text: "EXECUTIVE SUMMARY",
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
                          text: summaryText,
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
        })
      : null;

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
          width: { size: 45, type: WidthType.PERCENTAGE }
        }),
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: "003366" },
          borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder },
          children: [new Paragraph({ children: [new TextRun({ text: "Action Plan", bold: true, color: "FFFFFF", size: 19 })] })],
          width: { size: 24, type: WidthType.PERCENTAGE }
        }),
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: "003366" },
          borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder },
          children: [new Paragraph({ children: [new TextRun({ text: "Delivery Date", bold: true, color: "FFFFFF", size: 19 })] })],
          width: { size: 13, type: WidthType.PERCENTAGE }
        }),
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: "003366" },
          borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder },
          children: [new Paragraph({ children: [new TextRun({ text: "Person in Charge", bold: true, color: "FFFFFF", size: 19 })] })],
          width: { size: 13, type: WidthType.PERCENTAGE }
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
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: rowFill },
            borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder },
            children: [new Paragraph({ children: [new TextRun({ text: cleanField(item.action_plan), size: 18, color: "333333" })] })],
          }),
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: rowFill },
            borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder },
            children: [new Paragraph({ children: [new TextRun({ text: cleanField(item.indicative_delivery_date), size: 18, color: "333333" })] })],
          }),
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: rowFill },
            borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder },
            children: [new Paragraph({ children: [new TextRun({ text: cleanField(item.person_in_charge), size: 18, color: "333333" })] })],
          }),
        ]
      }));
    });

    // 5. Signature Approval Table (with Gold Divider Line)
    const prepBy = cleanField(meeting_details?.prepared_by);
    const confBy = cleanField(meeting_details?.confirmed_by);
    const prepDes = cleanField(meeting_details?.prep_designation);
    const confDes = cleanField(meeting_details?.conf_designation);

    const noBorder = { style: BorderStyle.NONE, size: 0, color: "auto" };

    const signTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 8, color: "C9AB4C" },
        bottom: noBorder,
        left: noBorder,
        right: noBorder,
        insideHorizontal: noBorder,
        insideVertical: noBorder,
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
              children: [
                new Paragraph({ children: [new TextRun({ text: "PREPARED BY:", bold: true, size: 18, color: "003366" })], spacing: { before: 120 } }),
                new Paragraph({ text: "", spacing: { after: 350 } }),
                new Paragraph({ children: [new TextRun({ text: "____________________________________", color: "888888" })] }),
                ...(prepBy ? [new Paragraph({ children: [new TextRun({ text: prepBy, bold: true, size: 18, color: "1B1D1E" })] })] : []),
                ...(prepDes ? [new Paragraph({ children: [new TextRun({ text: prepDes, size: 17, color: "666666" })] })] : []),
              ]
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
              children: [
                new Paragraph({ children: [new TextRun({ text: "CONFIRMED BY:", bold: true, size: 18, color: "003366" })], spacing: { before: 120 } }),
                new Paragraph({ text: "", spacing: { after: 350 } }),
                new Paragraph({ children: [new TextRun({ text: "____________________________________", color: "888888" })] }),
                ...(confBy ? [new Paragraph({ children: [new TextRun({ text: confBy, bold: true, size: 18, color: "1B1D1E" })] })] : []),
                ...(confDes ? [new Paragraph({ children: [new TextRun({ text: confDes, size: 17, color: "666666" })] })] : []),
              ]
            }),
          ]
        })
      ]
    });

    // Build the full Document sections (1-of-1 PDF Clone order and margins)
    const docChildren: any[] = [
      headerTable,
      new Paragraph({ text: "", spacing: { after: 150 } }),
      metaTable,
      new Paragraph({ text: "", spacing: { after: 150 } }),
    ];

    if (summaryTable) {
      docChildren.push(summaryTable);
      docChildren.push(new Paragraph({ text: "", spacing: { after: 150 } }));
    }

    docChildren.push(
      new Table({
        rows: tableRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      })
    );
    docChildren.push(new Paragraph({ text: "", spacing: { after: 200 } }));

    if (cleanField(other_discussions)) {
      docChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Other Discussions & Administrative Notes",
              bold: true,
              italics: true,
              size: 20,
              color: "003366",
            }),
          ],
          spacing: { before: 100, after: 80 }
        })
      );
      docChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: cleanField(other_discussions),
              size: 18,
              color: "333333"
            })
          ],
          spacing: { after: 250 }
        })
      );
    }

    docChildren.push(signTable);

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
