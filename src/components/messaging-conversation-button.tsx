import { FC, useState } from "react";
import ClipLoader from "react-spinners/ClipLoader";
import { Button } from "@material-tailwind/react";

export const MessagingConversationButton: FC<{
  onClick: () => void;
}> = ({ onClick }) => {
  const [isSending, setIsSending] = useState(false);
  return (
    <div>
      <h2 className="text-2xl font-bold mb-3 text-white">
        Awesome, we're ready!
      </h2>
      <p className="text-lg mb-5 text-blue-300/60">
        The app will generate a test conversation for you.
        <br />
        Just press the button below to continue.
      </p>

      <Button
        size="lg"
        className="bg-[#ffda59] text-[#6d4800] rounded-full hover:shadow-none normal-case text-lg"
        onClick={async () => {
          setIsSending(true);
          try {
            await onClick();
          } catch {
            setIsSending(false);
          }
          setIsSending(false);
        }}
      >
        <div className="flex justify-center">
          {isSending ? (
            <ClipLoader
              color={"#0d3679"}
              loading={true}
              size={28}
              className="mx-2"
            />
          ) : (
            <div className="mx-2">Load Conversations</div>
          )}
        </div>
      </Button>
    </div>
  );
};
