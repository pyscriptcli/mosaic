import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { StudioRecorderProvider } from "@/components/StudioRecorderProvider";

const cormorant = localFont({
  src: "../../public/fonts/cormorant-garamond-italic-latin.woff2",
  variable: "--font-cormorant",
  weight: "400 700",
  style: "italic",
  display: "swap",
});

const montserrat = localFont({
  src: "../../public/fonts/montserrat-latin.woff2",
  variable: "--font-montserrat",
  weight: "400 700",
  display: "swap",
});

const bebas = localFont({
  src: "../../public/fonts/bebas-neue-latin.woff2",
  variable: "--font-bebas",
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Mosaic — Work, Connected",
    template: "%s | Mosaic",
  },
  description: "Mosaic brings your team’s essential tools into one connected workspace.",
  icons: {
    icon: "/mosaic-app-icon.svg",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html 
      lang="en" 
      className={`${cormorant.variable} ${montserrat.variable} ${bebas.variable} h-full w-full`}
    >
      <body className="h-full w-full bg-bg-primary font-sans antialiased text-[#181D1E] overflow-hidden">
        <StudioRecorderProvider>{children}</StudioRecorderProvider>
      </body>
    </html>
  );
}
