import { useState, ReactNode } from "react";
import { copyTextToClipboard } from "../../utils/helpers";
import { toast } from "react-toastify";
import { Tooltip } from "@material-tailwind/react";

const CHANGE_ICON_TIME_MS = 1500;

interface ClipboardCopyProps {
  text: string;
  children: ReactNode;
  copyIcon?: ReactNode;
  copiedIcon?: ReactNode;
  className?: string;
}

export const SaveToClipboard = ({
  text,
  children,
  copyIcon,
  copiedIcon,
  className = "",
}: ClipboardCopyProps) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyClick = (event: any) => {
    event.stopPropagation();

    copyTextToClipboard(text)
      .then(() => {
        setIsCopied(true);

        setTimeout(() => {
          setIsCopied(false);
        }, CHANGE_ICON_TIME_MS);
      })
      .catch((err) => {
        toast.error(`Unfortunately this text cannot be copied: ${err}`);
        return Promise.reject(err);
      });
  };

  const defaultFilledCopyIcon = (
    <div className="w-[16px] h-[16px]">
      <img width={16} src="/assets/copy-filled.png" alt="copy-filled-icon" />
    </div>
  );
  const defaultCopyIcon = (
    <div className="w-[16px] h-[16px]">
      <img width={16} src="/assets/copy.png" alt="copy-icon" />
    </div>
  );

  return (
    <Tooltip content="Copied" open={isCopied}>
      <div
        className={`flex items-center ${className}`}
        onClick={handleCopyClick}
      >
        <div className="cursor-pointer">
          {isCopied
            ? copiedIcon || copyIcon || defaultFilledCopyIcon
            : copyIcon || defaultCopyIcon}
        </div>

        <div className="ml-1 md:ml-2 cursor-pointer whitespace-nowrap">
          {children}
        </div>
      </div>
    </Tooltip>
  );
};
