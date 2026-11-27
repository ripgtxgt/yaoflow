import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "YaoFlow · 后台",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      {/* 09-29 (Neil：恢复之前的字体): the admin never loaded the site's serif faces — its body font
          variable was undefined, so it inherited the html sans stack (Segoe UI / system CJK). Once the
          variables resolved (CJK fonts moved out of next/font) it fell to 宋体. `inherit` restores exactly
          the old look; data-admin keeps the labels at their old grey too. */}
      <body data-admin="" style={{ fontFamily: "inherit" }}>
        {/* 10-27: this browser is ours — Google Analytics marks its visits to the site as internal (components/GaTag.tsx) */}
        <script dangerouslySetInnerHTML={{ __html: 'try{localStorage.setItem("yf_internal","1")}catch(e){}' }} />
        {children}
      </body>
    </html>
  );
}
