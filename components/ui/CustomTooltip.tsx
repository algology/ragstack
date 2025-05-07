import React, { useState } from "react";

interface CustomTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({
  content,
  children,
  position = "top",
}) => {
  const [visible, setVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLSpanElement>(null);

  const showTooltip = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      let top = 0,
        left = 0;

      switch (position) {
        case "top":
          top = rect.top - 5;
          left = rect.left + rect.width / 2;
          break;
        case "bottom":
          top = rect.bottom + 5;
          left = rect.left + rect.width / 2;
          break;
        case "left":
          top = rect.top + rect.height / 2;
          left = rect.left - 5;
          break;
        case "right":
          top = rect.top + rect.height / 2;
          left = rect.right + 5;
          break;
        default:
          top = rect.top - 5;
          left = rect.left + rect.width / 2;
      }
      setTooltipPosition({ top, left });
      setVisible(true);
    }
  };

  const hideTooltip = () => {
    setVisible(false);
  };

  const tooltipStyle: React.CSSProperties = {
    position: "fixed",
    top: `${tooltipPosition.top}px`,
    left: `${tooltipPosition.left}px`,
    backgroundColor: "#333",
    color: "white",
    padding: "6px 12px",
    borderRadius: "6px",
    zIndex: 1000,
    display: visible ? "block" : "none",
    maxWidth: "250px",
    textAlign: "left",
    fontSize: "0.8rem",
    lineHeight: "1.4",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
    pointerEvents: "none",
  };

  if (position === "top") {
    tooltipStyle.transform = "translate(-50%, -100%)";
  } else if (position === "bottom") {
    tooltipStyle.transform = "translate(-50%, 0)";
  } else if (position === "left") {
    tooltipStyle.transform = "translate(-100%, -50%)";
  } else if (position === "right") {
    tooltipStyle.transform = "translate(0, -50%)";
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        style={{ display: "inline-block" }}
        tabIndex={0}
      >
        {children}
      </span>
      {visible && <div style={tooltipStyle}>{content}</div>}
    </>
  );
};

export default CustomTooltip;
