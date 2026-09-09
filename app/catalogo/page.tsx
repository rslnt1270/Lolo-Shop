"use client";
import { useEffect, useState } from "react";
import type { Product } from "@/lib/domain/types";
import { fetchProductsAction } from "@/lib/actions";

export default function CatalogHero() {
  const [products, setProducts] = useState<Product[]>([]);
  
  useEffect(() => {
    fetchProductsAction().then(setProducts);
  }, []);

  const featuredProduct = products.length > 0 ? products[0] : null;
  const imageSrc = featuredProduct?.imageUrl || "https://lh3.googleusercontent.com/aida-public/AB6AXuD6HqCZ1QwPLfT275aW3h9N_AJgtN9KK3rPw25D8YYiUWLiue26Z_5RmK87lVE9CsRUS37mYwcZs4tY0DZWPq4slB6tACrRvgcx-CNatV2g6NsJTlNr_nqfbHlcfJPX0rQdUY6x2mH-KGPfGeJIBC3C-Ndh51eeeg4WmX32gNhmXdfvcyIE4TlbGExldW_uhQ_BmAEbh-fW2Wap7ZXWvfzfqiaWX5Xket2hQJmHgnEwlVjFtxhri3RgmLCZ27R_x2Acc22-4DZopzUL";
  const title = featuredProduct?.title || "GHOST_PUFFER v1";
  
  // WhatsApp Message
  const waMessage = encodeURIComponent(`Hola, me interesa apartar el producto: ${title}`);
  return (
    <div className="bg-[#f6faff] text-[#141d23] min-h-screen">

{/*  Ambient Background Gradients  */}
<div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
<div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-container/10 blur-[100px] opacity-70 mix-blend-multiply"></div>
<div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-tertiary-fixed-dim/20 blur-[120px] opacity-60 mix-blend-multiply"></div>
</div>
{/*  TopAppBar  */}
<header className="fixed top-4 left-4 right-4 rounded-lg bg-surface/80 backdrop-blur-xl border border-surface-container-lowest/20 shadow-[0px_20px_40px_rgba(0,0,0,0.04)] z-50 flex justify-between items-center px-gutter h-16 w-[calc(100%-32px)] md:w-[calc(100%-64px)] max-w-[1440px] mx-auto md:top-8 md:left-8 md:right-8">
<button className="hover:opacity-80 transition-opacity active:scale-95 transition-transform text-on-surface-variant flex items-center justify-center p-2 rounded-full hover:bg-surface-container-highest/50">
<span className="material-symbols-outlined text-[24px]" style={{fontVariationSettings: "'FILL' 0"}}>menu</span>
</button>
<div className="text-headline-lg-mobile md:text-headline-lg font-headline-lg-mobile md:font-headline-lg tracking-tighter text-primary">
            LOLOSHOP
        </div>
<button className="hover:opacity-80 transition-opacity active:scale-95 transition-transform text-on-surface-variant flex items-center justify-center p-2 rounded-full hover:bg-surface-container-highest/50">
<span className="material-symbols-outlined text-[24px]" style={{fontVariationSettings: "'FILL' 0"}}>shopping_bag</span>
</button>
</header>
{/*  Main Content Area  */}
<main className="flex-grow flex flex-col items-center justify-center pt-[100px] pb-[120px] px-margin-mobile md:px-margin-desktop w-full max-w-container-max mx-auto min-h-screen relative">
{/*  3D Hero Canvas Container  */}
<div className="w-full max-w-[1000px] aspect-[4/5] md:aspect-video relative rounded-xl overflow-hidden glass-panel flex items-center justify-center mb-stack-lg group">
{/*  Backdrop Design inside container  */}
<div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface-container-highest/30 rounded-xl"></div>
{/*  The Product (Simulated 3D Object)  */}
<div className="relative z-10 w-[80%] h-[80%] animate-float flex items-center justify-center">
<img className="object-contain w-full h-full drop-shadow-[0_30px_50px_rgba(0,106,106,0.15)] filter saturate-110 contrast-105" data-alt="A highly realistic, high-end 3D render of a futuristic puffy streetwear jacket floating in a bright, minimalist studio space. The jacket is a luminous tech-nylon material in a striking, vibrant teal color, contrasting with the soft, airy off-white background. The lighting is soft and diffused, creating a premium light-mode aesthetic with gentle shadows and highlights that emphasize the jacket's voluminous, cloud-like texture and spatial minimalism." src={imageSrc}/>
</div>
{/*  Floating Tech Badges  */}
<div className="absolute top-8 left-8 bg-surface-container-lowest/80 backdrop-blur-md border border-white/50 rounded-full px-4 py-1.5 text-label-md font-label-md text-primary flex items-center gap-2 shadow-sm">
<span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                NEW ARRIVAL
            </div>
<div className="absolute bottom-8 right-8 bg-primary-container/20 backdrop-blur-md border border-primary-container/30 rounded-full px-4 py-1.5 text-label-md font-label-md text-on-primary-container shadow-sm hidden md:flex">
                AR READY
            </div>
</div>
{/*  Typography & Details Section  */}
<div className="w-full max-w-[800px] flex flex-col items-center text-center space-y-stack-md z-10 relative">
<div>
<h1 className="text-display-lg md:text-display-xl font-display-lg md:font-display-xl text-on-surface mb-2">{title}</h1>
<p className="text-body-lg font-body-lg text-on-surface-variant max-w-[600px] mx-auto">Engineered for the urban environment. Lightweight thermal dynamics encased in a seamless tech-nylon shell.</p>
</div>
{/*  Bento Details Grid (Glassmorphic)  */}
<div className="grid grid-cols-3 gap-4 w-full max-w-[500px]">
<div className="glass-panel rounded-lg p-4 flex flex-col items-center justify-center">
<span className="text-label-md font-label-md text-outline uppercase tracking-wider mb-1">Material</span>
<span className="text-body-md font-body-md text-on-surface font-medium">Tech-Nylon</span>
</div>
<div className="glass-panel rounded-lg p-4 flex flex-col items-center justify-center">
<span className="text-label-md font-label-md text-outline uppercase tracking-wider mb-1">Size</span>
<span className="text-body-md font-body-md text-on-surface font-medium">OS (One Size)</span>
</div>
<div className="glass-panel rounded-lg p-4 flex flex-col items-center justify-center">
<span className="text-label-md font-label-md text-outline uppercase tracking-wider mb-1">Fit</span>
<span className="text-body-md font-body-md text-on-surface font-medium">Relaxed</span>
</div>
</div>
</div>
</main>
{/*  Floating CTA Button (Bottom Center)  */}
<div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-40px)] max-w-[400px]">
<a href={`https://wa.me/5211234567890?text=${waMessage}`} target="_blank" className="w-full bg-primary-container text-on-primary rounded-full py-4 px-8 text-body-lg font-body-lg font-semibold flex items-center justify-center gap-3 lolo-glow overflow-hidden relative group">
<div className="absolute inset-0 bg-white/20 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
<span className="material-symbols-outlined text-[24px] relative z-10" style={{fontVariationSettings: "'FILL' 1"}}>chat</span>
<span className="relative z-10">Apartar por WhatsApp</span>
</a>
</div>

    </div>
  );
}
