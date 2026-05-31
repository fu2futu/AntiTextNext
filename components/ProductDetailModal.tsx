"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

type ProductDetailModalProps = {
  children: React.ReactNode;
  onClose?: () => void;
};

export default function ProductDetailModal({ children, onClose }: ProductDetailModalProps) {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // Trigger animation after mount
    requestAnimationFrame(() => {
      setIsVisible(true);
    });
    
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      if (onClose) {
        onClose();
      } else {
        router.back();
      }
    }, 300);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100]"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black transition-opacity duration-300 ${
          isVisible && !isClosing ? 'opacity-50' : 'opacity-0'
        }`}
      />
      
      {/* Modal Content - Bottom Sheet */}
      <div 
        className={`absolute inset-x-0 bottom-0 top-12 bg-white rounded-t-3xl shadow-2xl overflow-hidden transition-transform duration-300 ease-out ${
          isVisible && !isClosing ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Drag handle */}
        <div className="sticky top-0 bg-white z-10 pt-3 pb-2 flex justify-center">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
          <button
            onClick={handleClose}
            className="absolute right-4 top-2 p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="閉じる"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        {/* Scrollable content */}
        <div className="overflow-y-auto h-full pb-24">
          {children}
        </div>
      </div>
    </div>
  );
}
