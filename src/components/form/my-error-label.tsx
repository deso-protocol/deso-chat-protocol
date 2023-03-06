interface MyErrorLabelProps {
  error?: string;
}

export const MyErrorLabel = ({ error }: MyErrorLabelProps) => {
  if (!error) {
    return <></>;
  }

  return <div className="text-red-500 text-sm mt-1">{error}</div>;
};
