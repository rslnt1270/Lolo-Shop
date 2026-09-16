"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { useRef } from "react";

export default function CatalogClient({
  isLoggedIn,
  title,
  imageSrc,
  waMessage,
}: {
  isLoggedIn: boolean;
  title: string;
  imageSrc: string;
  waMessage: string;
}) {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  // Animaciones parallax y fade en función del scroll
  const yImage = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const opacityImage = useTransform(scrollYProgress, [0, 0.8], [1, 0.2]);
  const scaleImage = useTransform(scrollYProgress, [0, 1], [1, 0.9]);

  return (
    <div ref={containerRef} className="bg-[#f6faff] text-[#141d23] min-h-screen relative">
      {/* Ambient Background Gradients */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container/10 blur-[100px] opacity-70 mix-blend-multiply"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-tertiary-fixed-dim/20 blur-[120px] opacity-60 mix-blend-multiply"></div>
      </div>

      {/* TopAppBar */}
      <motion.header
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-4 left-4 right-4 rounded-lg bg-surface/80 backdrop-blur-xl border border-surface-container-lowest/20 shadow-[0px_20px_40px_rgba(0,0,0,0.04)] z-50 flex justify-between items-center px-gutter h-16 w-[calc(100%-32px)] md:w-[calc(100%-64px)] max-w-[1440px] mx-auto md:top-8 md:left-8 md:right-8"
      >
        {isLoggedIn ? (
          <Link
            href="/"
            className="hover:opacity-80 transition-opacity flex items-center justify-center py-2 px-3 rounded-full hover:bg-surface-container-highest/50 text-primary font-semibold gap-2 border border-primary/20"
          >
            <span className="material-symbols-outlined text-[20px]">dashboard</span>
            <span className="hidden md:inline text-sm">Dashboard</span>
          </Link>
        ) : (
          <button className="hover:opacity-80 transition-opacity active:scale-95 transition-transform text-on-surface-variant flex items-center justify-center p-2 rounded-full hover:bg-surface-container-highest/50">
            <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 0" }}>menu</span>
          </button>
        )}
        <div className="text-headline-lg-mobile md:text-headline-lg font-headline-lg-mobile md:font-headline-lg tracking-tighter text-primary">
          LOLOSHOP
        </div>
        <button className="hover:opacity-80 transition-opacity active:scale-95 transition-transform text-on-surface-variant flex items-center justify-center p-2 rounded-full hover:bg-surface-container-highest/50">
          <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 0" }}>shopping_bag</span>
        </button>
      </motion.header>

      {/* Main Content Area */}
      <main className="flex-grow flex flex-col items-center justify-center pt-[100px] pb-[150px] px-margin-mobile md:px-margin-desktop w-full max-w-container-max mx-auto relative z-10">
        
        {/* 3D Hero Canvas Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className="w-full max-w-[1000px] aspect-square md:aspect-video relative rounded-xl overflow-hidden glass-panel flex items-center justify-center mb-stack-lg group sticky top-28"
          style={{ y: yImage, opacity: opacityImage, scale: scaleImage }}
        >
          {/* Backdrop Design inside container */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface-container-highest/30 rounded-xl"></div>
          
          {/* The Product (Simulated 3D Object) */}
          <motion.div 
            className="relative z-10 w-full h-full p-16 md:p-24 flex items-center justify-center"
            animate={{ y: [0, -15, 0] }}
            transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
          >
            <img
              className="object-contain max-w-full max-h-full drop-shadow-[0_30px_50px_rgba(0,106,106,0.15)] filter saturate-110 contrast-105"
              src={imageSrc}
              alt={title}
            />
          </motion.div>
          
          {/* Floating Tech Badges */}
          <div className="absolute top-8 left-8 bg-surface-container-lowest/80 backdrop-blur-md border border-white/50 rounded-full px-4 py-1.5 text-label-md font-label-md text-primary flex items-center gap-2 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            NEW ARRIVAL
          </div>
          <div className="absolute bottom-8 right-8 bg-primary-container/20 backdrop-blur-md border border-primary-container/30 rounded-full px-4 py-1.5 text-label-md font-label-md text-on-primary-container shadow-sm hidden md:flex">
            AR READY
          </div>
        </motion.div>

        {/* Spacer for sticky effect */}
        <div className="h-[20vh] md:h-[40vh] w-full"></div>

        {/* Typography & Details Section */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[800px] flex flex-col items-center text-center space-y-stack-md z-20 relative bg-[#f6faff]/80 backdrop-blur-xl p-8 rounded-3xl border border-white shadow-xl"
        >
          <div>
            <h1 className="text-display-lg md:text-display-xl font-display-lg md:font-display-xl text-on-surface mb-2">
              {title}
            </h1>
            <p className="text-body-lg font-body-lg text-on-surface-variant max-w-[600px] mx-auto">
              Engineered for the urban environment. Lightweight thermal dynamics encased in a seamless tech-nylon shell.
            </p>
          </div>
          
          {/* Bento Details Grid (Glassmorphic) */}
          <div className="grid grid-cols-3 gap-4 w-full max-w-[500px]">
            {[
              { label: "Material", value: "Tech-Nylon" },
              { label: "Size", value: "OS (One Size)" },
              { label: "Fit", value: "Relaxed" }
            ].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
                className="glass-panel rounded-lg p-4 flex flex-col items-center justify-center bg-white/50"
              >
                <span className="text-label-md font-label-md text-outline uppercase tracking-wider mb-1">
                  {item.label}
                </span>
                <span className="text-body-md font-body-md text-on-surface font-medium">
                  {item.value}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
        
        {/* Extra spacing at bottom to allow scrolling */}
        <div className="h-[20vh] w-full"></div>
      </main>

      {/* Floating CTA Button (Bottom Center) */}
      <motion.div
        initial={{ y: 100, opacity: 0, x: "-50%" }}
        animate={{ y: 0, opacity: 1, x: "-50%" }}
        transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="fixed bottom-8 left-1/2 z-[60] w-[calc(100%-40px)] max-w-[400px]"
      >
        <a
          href={`https://wa.me/5211234567890?text=${waMessage}`}
          target="_blank"
          className="w-full bg-primary-container text-on-primary rounded-full py-4 px-8 text-body-lg font-body-lg font-semibold flex items-center justify-center gap-3 lolo-glow overflow-hidden relative group shadow-2xl"
        >
          <div className="absolute inset-0 bg-white/20 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
          <span className="material-symbols-outlined text-[24px] relative z-10" style={{ fontVariationSettings: "'FILL' 1" }}>
            chat
          </span>
          <span className="relative z-10">Apartar por WhatsApp</span>
        </a>
      </motion.div>
    </div>
  );
}
