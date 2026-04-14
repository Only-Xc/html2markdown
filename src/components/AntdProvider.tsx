"use client";

import { App as AntdApp, ConfigProvider, theme as antdTheme } from "antd";
import { useEffect, useState } from "react";

interface Props {
  children: React.ReactNode;
}

export default function AntdProvider({ children }: Props) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const syncMode = () => {
      setDark(root.classList.contains("dark"));
    };

    syncMode();

    const observer = new MutationObserver(syncMode);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  return (
    <ConfigProvider
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: dark ? "#8db8ff" : "#2563eb",
          colorInfo: dark ? "#8db8ff" : "#2563eb",
          colorSuccess: dark ? "#7dd3fc" : "#0ea5e9",
          colorBgElevated: dark ? "#10203a" : "#ffffff",
          colorBgContainer: dark ? "#10203a" : "#ffffff",
          colorText: dark ? "#f4f8ff" : "#13233f",
          colorTextPlaceholder: dark ? "#90a6ca" : "#6b7d99",
          colorBorder: dark ? "#264167" : "#d7e4f7",
          boxShadowSecondary: dark
            ? "0 20px 60px rgba(3, 10, 26, 0.45)"
            : "0 20px 60px rgba(37, 99, 235, 0.12)",
          borderRadius: 20,
          borderRadiusLG: 26,
          fontFamily: "var(--font-sans)",
        },
      }}
    >
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
