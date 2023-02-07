import ClipLoader from "react-spinners/ClipLoader";
import { useState } from "react";
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

  return (
    <div className="flex justify-center items-start w-full p-0 pb-2 md:p-4 md:pb-2">
      <div className="flex-1">
        <div className="hidden md:block">
          <Textarea
            className="p-2 text-base text-blue-100 bg-black/70 border-blue-gray-100 focus:shadow-none border-none focus:border-solid flex-1"
            label="What's on your mind?"
            onChange={(e) => {
              setMessageToSend(e.target.value);
            }}
            value={messageToSend}
          />
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
      <div className="flex h-[100px] items-center">
        <Button
          onClick={async () => {
            if (messageToSend === "") {
              toast.warning("The provided message is empty");
              return;
            }
            setIsSending(true);
            try {
              await onClick(messageToSend);
            } catch (e: any) {
              setIsSending(false);
              toast.error(
                `There was an issue when sending your message. Error: ${e.toString()}`
              );
              console.error(e);
              return;
            }
            setMessageToSend("");
            setIsSending(false);
          }}
          className="bg-[#ffda59] ml-4 text-[#6d4800] center rounded-full hover:shadow-none normal-case text-lg"
        >
          <div className="flex justify-center md:w-[80px]">
            {isSending ? (
              <ClipLoader
                color={"#6d4800"}
                loading={true}
                size={28}
                className="mx-2"
              />
            ) : (
              <>
                <div className="hidden md:block mx-2">Send</div>
                <div className="visible md:hidden mx-2">
                  <img src="/assets/send.png" width={28} />
                </div>
              </>
            )}
          </div>
        </Button>
      </div>
    </div>
  );
};
