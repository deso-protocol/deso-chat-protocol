import { MyErrorLabel } from "./my-error-label";

interface MyInputProps {
  label: string;
  error?: string;
  placeholder: string;
  autoFocus?: boolean;
  value: string;
  setValue: (e: string) => void;
}

export const MyInput = ({
  label,
  error,
  placeholder,
  autoFocus = false,
  value = "",
  setValue,
}: MyInputProps) => {
  return (
    <>
      <div className="text-lg font-semibold mb-2 text-blue-100">{label}</div>

      <input
        className={`w-full border outline-none rounded-md text-blue-100 bg-blue-900/20 py-2 px-3 ${
          error ? "border-red-500" : "border-transparent"
        }`}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus={autoFocus}
        placeholder={placeholder}
      />

      <MyErrorLabel error={error} />
    </>
  );
};
