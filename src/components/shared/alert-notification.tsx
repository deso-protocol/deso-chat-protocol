import { Alert } from "@material-tailwind/react";
import { ReactElement } from "react";

const svgIconByType: { [key: string]: ReactElement } = {
  info: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className="h-6 w-6"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  success: (
    <span style={{ color: "#4caf50" }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        role="img"
        aria-hidden="true"
        fill="currentColor"
        stroke="currentColor"
        className="h-6 w-6"
      >
        <path d="M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z"></path>
      </svg>
    </span>
  ),
};

const classesByType: { [key: string]: string } = {
  info: "bg-[#E8F2FE] text-slate-700",
  success: "bg-[#EBF5EB] text-slate-700",
};

export const AlertNotification = (props: any) => {
  const { type = "info", children, ...restProps } = props;

  return (
    <div className="mb-4">
      <Alert
        {...restProps}
        icon={svgIconByType[type]}
        className={`mr-0 ${classesByType[type]} ${props.className || ""}`}
      >
        {children}
      </Alert>
    </div>
  );
};
