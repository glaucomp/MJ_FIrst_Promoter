import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import lottieMJPromoLogo from '../assets/lottieMJPromoLogo.lottie';

interface LogoLottieProps {
  className?: string;
  width?: number | string;
  height?: number | string;
  ariaLabel?: string;
}

export const LogoLottie = ({
  className,
  width,
  height,
  ariaLabel = 'MJ Promoter',
}: LogoLottieProps) => {
  return (
    <div
      className={className}
      style={{ width, height, display: 'inline-flex', alignItems: 'center' }}
      role="img"
      aria-label={ariaLabel}
    >
      <DotLottieReact
        src={lottieMJPromoLogo}
        autoplay
        loop={false}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};
