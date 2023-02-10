import { useState } from 'react';
import { Button, Textarea } from "@material-tailwind/react";
import { toast } from "react-toastify";

export interface SendMessageButtonAndInputProps {
  onClick: (messageToSend: string) => void;
}

export const SendMessageButtonAndInput = ({
  onClick,
}: SendMessageButtonAndInputProps) => {
  const [isSending, setIsSending] = useState(false);
  const [messageToSend, setMessageToSend] = useState('');

  const sendMessage = async () => {
    if (messageToSend === '') {
      toast.warning('The provided message is empty');
      return;
    }
    if (isSending) {
      toast.warning('Please wait a second before sending another message');
      return;
    }
    setIsSending(true);
    setMessageToSend('');
    try {
      await onClick(messageToSend)
    } catch (e) {
      // If the onClick handler failed, reset the messageToSend
      // so the sender doesn't lose it.
      setMessageToSend(messageToSend)
    }
    setIsSending(false);
  }

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
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                await sendMessage();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                setMessageToSend(messageToSend.trim());
              }
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
          onClick={sendMessage}
          className='bg-[#ffda59] ml-4 text-[#6d4800] center rounded-full hover:shadow-none normal-case text-lg'
        >
          <div className="flex justify-center md:w-[80px]">
            <div className="hidden md:block mx-2">Send</div>
            <div className="visible md:hidden mx-2">
              <img src="/assets/send.png" width={28} alt="send" />
            </div>
          </div>
        </Button>
      </div>
    </div>
  );
};
