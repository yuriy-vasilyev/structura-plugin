import { FC } from "react";

interface MicrosoftLogoProps {
  className?: string;
}

export const MicrosoftLogo: FC<MicrosoftLogoProps> = ({ className }) => {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width="96px"
      height="96px"
    >
      <path
        style={{ fill: "#4CAF50" }}
        d="M272,240h240V16c0-8.832-7.168-16-16-16H272V240z"
      />
      <path
        style={{ fill: "#F44336" }}
        d="M240,240V0H16C7.168,0,0,7.168,0,16v224H240z"
      />
      <path
        style={{ fill: "#2196F3" }}
        d="M240,272H0v224c0,8.832,7.168,16,16,16h224V272z"
      />
      <path
        style={{ fill: "#FFC107" }}
        d="M272,272v240h224c8.832,0,16-7.168,16-16V272H272z"
      />
    </svg>
  );
};
