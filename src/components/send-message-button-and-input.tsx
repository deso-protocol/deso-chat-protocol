import { KeyboardEvent, useState } from "react";
import { Button, Textarea } from "@material-tailwind/react";
import { toast } from "react-toastify";

export interface SendMessageButtonAndInputProps {
  onClick: (messageToSend: string) => void;
}

export const SendMessageButtonAndInput = ({
  onClick,
}: SendMessageButtonAndInputProps) => {
  const [isSending, setIsSending] = useState(false);
  const [messageToSend, setMessageToSend] = useState("");

  const sendMessage = async () => {
    if (messageToSend === "") {
      toast.warning("The provided message is empty");
      return;
    }
    if (isSending) {
      toast.warning(
        "Going too fast! Please wait a second before sending another message"
      );
      return;
    }
    setIsSending(true);
    setMessageToSend("");
    try {
      await onClick(messageToSend);
    } catch (e) {
      // If the onClick handler failed, reset the messageToSend
      // so the sender doesn't lose it.
      setMessageToSend(messageToSend);
    }
    setIsSending(false);
  };

  // Pressing the Enter key during Japanese conversion has prevented the message from being sent in the middle of the conversion.
  // The same phenomenon should occur in Chinese and other languages.
  // We have also confirmed that it works in English.
  const canSend = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      return true;
    }
    return false;
  };

  return (
    <div className="relative flex justify-center items-start w-full p-0 pb-2 md:p-4 md:pb-2">
      <div className="flex-1">
        <div className="hidden md:block relative">
          <div className="relative">
            <p className="text-left text-blue-300/60 mb-3 text-xs">
              Press <code className="text-blue-300">Shift + Return</code> for paragraph breaks.
            </p>
            <Textarea
              className="p-2 pr-[200px] text-blue-100 bg-black/70 border-blue-gray-100 focus:shadow-none border-none focus:border-solid flex-1"
              label="What's on your mind?"
              onChange={(e) => {
                setMessageToSend(e.target.value);
              }}
              onKeyDown={async (e) => {
                if (canSend(e)) {
                  await sendMessage();
                }
              }}
              onKeyUp={(e) => {
                if (canSend(e)) {
                  setMessageToSend(messageToSend.trim());
                }
              }}
              value={messageToSend}
            />
          </div>
        </div>

        <div className="visible md:hidden">
          <textarea
            className="w-full h-[92px] p-2 text-base text-blue-100 bg-black/70 border-blue-gray-100 focus:shadow-none border-none focus:border-solid flex-1 rounded-[7px]"
            onChange={(e) => {
              setMessageToSend(e.target.value);
            }}
            placeholder="What's on your mind?"
            value={messageToSend}
          />
        </div>
      </div>
      <div className="flex h-[100px] items-center absolute right-[10px] top-[10px] lg:right-[30px] lg:top-[30px]">
        <Button
          onClick={sendMessage}
          className="bg-[#ffda59] ml-4 px-2 py-2 text-[#6d4800] center rounded-full hover:shadow-none normal-case text-lg"
        >
          <div className="flex justify-center md:w-[80px]">
            <div className="hidden md:block mx-2">Send</div>
            <div className="visible md:hidden mx-2">
              <img src="/assets/send.png" width={18} alt="send" />
            </div>
          </div>
        </Button>
      </div>
    </div>
  );
};
