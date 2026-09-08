export default function POSDashboard() {
  return (
    <div className="bg-[#f8f9fa] text-[#191c1d] min-h-screen flex selection:bg-[#3cbfbf] selection:text-white">

{/*  Shared Component: SideNavBar  */}
<nav className="bg-white/65 backdrop-blur-[30px] font-body-base text-body-base fixed left-0 top-0 h-full w-[280px] rounded-r-lg border-r-[1.5px] border-white/80 shadow-[0_20px_40px_rgba(0,0,0,0.04)] flex flex-col p-container-padding z-50">
{/*  Brand  */}
<div className="mb-12">
<h1 className="font-display-lg text-display-lg text-primary tracking-tighter leading-none">Lolo</h1>
<p className="text-on-surface-variant text-sm mt-2 opacity-60 uppercase tracking-widest font-label-caps">Internal Admin</p>
</div>
{/*  Navigation Links  */}
<div className="flex-1 space-y-2">
<a className="flex items-center gap-3 px-4 py-3 text-secondary hover:text-primary transition-colors hover:scale-[1.02] hover:bg-white/40 transition-transform rounded-xl cursor-pointer active:scale-95 duration-200" href="#">
<span className="material-symbols-outlined text-xl">inventory_2</span>
<span>Inventory</span>
</a>
{/*  Active Tab: POS  */}
<a className="flex items-center gap-3 px-4 py-3 bg-primary-container text-on-primary-container rounded-full shadow-sm cursor-pointer active:scale-95 duration-200" href="#">
<span className="material-symbols-outlined text-xl" style={{fontVariationSettings: "'FILL' 1"}}>point_of_sale</span>
<span className="font-semibold">POS</span>
</a>
<a className="flex items-center gap-3 px-4 py-3 text-secondary hover:text-primary transition-colors hover:scale-[1.02] hover:bg-white/40 transition-transform rounded-xl cursor-pointer active:scale-95 duration-200" href="#">
<span className="material-symbols-outlined text-xl">auto_stories</span>
<span>Catalog</span>
</a>
<a className="flex items-center gap-3 px-4 py-3 text-secondary hover:text-primary transition-colors hover:scale-[1.02] hover:bg-white/40 transition-transform rounded-xl cursor-pointer active:scale-95 duration-200" href="#">
<span className="material-symbols-outlined text-xl">settings</span>
<span>Settings</span>
</a>
</div>
{/*  Footer / Profile  */}
<div className="mt-auto pt-6 border-t border-black/5">
<div className="flex items-center gap-3 mb-6 px-4">
<div className="w-10 h-10 rounded-full bg-surface-variant overflow-hidden shrink-0 border border-white">
<img alt="Store Manager Profile" className="w-full h-full object-cover" data-alt="A close up, high key portrait of a young streetwear retail manager looking confident, soft studio lighting, light mode aesthetic, minimalist background" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCMnSgHZsCT1lf8JQFnaE7Pz1I8Y1ZtkC7u-p6CXNAmhsGeLxrVKfv7QBxCNmFZ1twiUsjYf5IKljIa-CCv_s9jX_FuWuraQ5UmZgrxXRHMpIdI_xGPOYarAaDMGAZH_c95cPWzAgTm6pDT_QP4seuzPheOcDU49esOQKaWiCmS1X1AsZ7mKjZOy_ebDf3-5lIU1l0m8HIKs0ClC8J8W7-Ae-aMMcOu6qR15k7omB5ghnAG_elFsFTU8UH59T1rAJMBu6kSW0iIBASq"/>
</div>
<div>
<p className="font-semibold text-sm">Store Manager Profile</p>
<p className="text-xs text-secondary">Manager</p>
</div>
</div>
<a className="flex items-center gap-3 px-4 py-3 text-secondary hover:text-primary transition-colors hover:scale-[1.02] hover:bg-white/40 transition-transform rounded-xl cursor-pointer active:scale-95 duration-200" href="#">
<span className="material-symbols-outlined text-xl">logout</span>
<span>Logout</span>
</a>
</div>
</nav>
{/*  Main Workspace  */}
<main className="ml-[280px] w-[calc(100%-280px)] min-h-screen flex flex-col relative">
{/*  Decorative Background Element  */}
<div className="absolute inset-0 z-[-1] overflow-hidden pointer-events-none opacity-40">
<div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-primary-container/20 rounded-full blur-[120px]"></div>
<div className="absolute bottom-[-10%] left-[20%] w-[500px] h-[500px] bg-surface-tint/10 rounded-full blur-[100px]"></div>
</div>
{/*  Shared Component: TopAppBar  */}
<header className="bg-transparent font-headline-md text-headline-md flex justify-between items-center px-gutter py-4 w-full h-20 transition-all duration-300 z-40">
<div className="flex items-center gap-6">
<h2 className="font-headline-md text-headline-md text-on-background font-bold tracking-tight">Live Dashboard</h2>
{/*  Minimalist Search / Status indicator  */}
<div className="flex items-center gap-2 px-4 py-2 bg-white/50 backdrop-blur-md rounded-full border border-white/60 shadow-sm">
<div className="w-2 h-2 rounded-full bg-primary-container animate-pulse"></div>
<span className="text-sm font-data-mono text-secondary">System Online</span>
</div>
</div>
<div className="flex items-center gap-2 text-primary dark:text-inverse-primary">
<button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/60 hover:text-primary transition-colors cursor-pointer active:scale-95 duration-200">
<span className="material-symbols-outlined">notifications</span>
</button>
<button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/60 hover:text-primary transition-colors cursor-pointer active:scale-95 duration-200">
<span className="material-symbols-outlined">cloud_done</span>
</button>
<button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/60 hover:text-primary transition-colors cursor-pointer active:scale-95 duration-200">
<span className="material-symbols-outlined">account_circle</span>
</button>
</div>
</header>
{/*  Dashboard Canvas  */}
<div className="flex-1 p-container-padding flex flex-col gap-8 max-w-[1400px] mx-auto w-full">
{/*  Top Section: Scanner & Actions (Bento Grid)  */}
<div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-auto lg:h-[400px]">
{/*  POS Scanner Area (Col span 7)  */}
<div className="lg:col-span-8 glass-panel rounded-lg p-glass-padding flex flex-col relative overflow-hidden group">
{/*  Scanner scanning line animation  */}
<div className="absolute left-0 right-0 h-[2px] bg-primary-container/80 shadow-[0_0_15px_rgba(60,191,191,0.8)] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-hover:animate-[scan_2s_ease-in-out_infinite] z-10 pointer-events-none"></div>
<div className="flex justify-between items-start mb-6">
<div>
<h3 className="font-headline-md text-xl font-semibold">Active Session</h3>
<p className="text-secondary mt-1">Terminal 04</p>
</div>
<div className="px-3 py-1 bg-black text-white font-label-caps text-label-caps rounded-full flex items-center gap-2">
<span className="material-symbols-outlined text-sm">barcode_reader</span>
                            Ready
                        </div>
</div>
{/*  Borderless Scanner visual  */}
<div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-outline-variant/40 rounded-xl mb-6 bg-white/20 relative">
<span className="material-symbols-outlined text-6xl text-outline-variant/50 mb-4 font-light">document_scanner</span>
<p className="font-data-mono text-secondary text-lg tracking-widest">Awaiting Scan...</p>
</div>
{/*  Manual Input  */}
<div className="mt-auto">
<div className="relative">
<span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-secondary">keyboard</span>
<input className="w-full bg-white/50 border-none shadow-inner rounded-full py-4 pl-12 pr-4 font-data-mono text-data-mono text-on-background focus:ring-2 focus:ring-primary-container/50 focus:bg-white transition-all placeholder:text-secondary/70" placeholder="Manual SKU Entry..." type="text"/>
</div>
</div>
</div>
{/*  Action Panel (Col span 5)  */}
<div className="lg:col-span-4 flex flex-col gap-6 justify-end">
{/*  Quick Stats Widget  */}
<div className="glass-panel rounded-lg p-6 flex-1 flex flex-col justify-center">
<p className="font-label-caps text-label-caps text-secondary mb-2">Today's Volume</p>
<div className="flex items-baseline gap-2">
<span className="font-display-lg text-4xl">142</span>
<span className="font-data-mono text-secondary">units</span>
</div>
<div className="mt-4 w-full h-1 bg-surface-variant rounded-full overflow-hidden">
<div className="w-[65%] h-full bg-primary-container rounded-full"></div>
</div>
</div>
{/*  Primary Actions  */}
<div className="flex flex-col gap-4">
<button className="w-full bg-transparent border-[1.5px] border-on-background text-on-background rounded-full px-6 py-4 font-label-caps text-label-caps hover:bg-black/5 active:scale-95 transition-all flex items-center justify-center gap-2">
<span className="material-symbols-outlined">qr_code_scanner</span>
                            Escanear
                        </button>
<button className="w-full bg-primary-container text-white shadow-[0_10px_20px_rgba(60,191,191,0.2)] rounded-full px-6 py-5 font-label-caps text-label-caps text-sm hover:scale-[1.02] hover:shadow-[0_15px_30px_rgba(60,191,191,0.3)] active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 tracking-widest uppercase">
<span className="material-symbols-outlined">add_task</span>
                            Registrar Movimiento
                        </button>
</div>
</div>
</div>
{/*  Bottom Section: Recent Activity Table  */}
<div className="glass-panel rounded-lg p-glass-padding flex flex-col mt-4">
<div className="flex justify-between items-center mb-6">
<h3 className="font-headline-md text-xl font-semibold">Recent Activity</h3>
<button className="text-primary-container hover:text-primary transition-colors font-label-caps text-label-caps flex items-center gap-1">
                        View All <span className="material-symbols-outlined text-sm">arrow_forward</span>
</button>
</div>
<div className="w-full overflow-x-auto">
<table className="w-full text-left border-collapse">
<thead>
<tr className="border-b border-black/5 text-secondary font-label-caps text-label-caps">
<th className="py-4 px-4 font-normal">SKU</th>
<th className="py-4 px-4 font-normal">Item Name</th>
<th className="py-4 px-4 font-normal">Delta</th>
<th className="py-4 px-4 font-normal">User</th>
<th className="py-4 px-4 font-normal text-right">Time</th>
</tr>
</thead>
<tbody className="font-data-mono text-data-mono text-on-background">
{/*  Row 1  */}
<tr className="border-b border-black/5 hover:bg-white/40 transition-colors group">
<td className="py-4 px-4 text-secondary group-hover:text-primary transition-colors">OS-TS-BLK-L</td>
<td className="py-4 px-4 font-body-base">Oversized Heavyweight Tee</td>
<td className="py-4 px-4">
<span className="inline-flex items-center px-2 py-1 rounded-full bg-[#f0fdf4] text-[#166534] text-xs font-bold gap-1">
<span className="material-symbols-outlined text-[14px]">arrow_upward</span> 1
                                    </span>
</td>
<td className="py-4 px-4 flex items-center gap-2">
<div className="w-6 h-6 rounded-full bg-surface-variant overflow-hidden shrink-0">
<img className="w-full h-full object-cover" data-alt="A small avatar of a retail staff member, light background" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAqu95ylvXcxBRhZmDHJ4tEKTpDJDvnGy66KTLRJ1sDkpphf1GgF8Tu5-uCt9P1agsxgEXW9evnzhDbx13Hc4F-3sR-FGr23zz8PaBNFG86GmeHRSCfVbOkwPqU-BTJUt-SvDeHctY1HtlaXvAZ_6dgNJzp7WYNrZjVLAdzTb3PMmzbzQYVILGTjNTPGffjx1ZTXs71eW8izf5bh13xcEAiW2kxvLfEEqYdBqMUfeiHQOQvcETRhsDSxZe_nChZzhbiwadLfKx9byxI"/>
</div>
<span className="font-body-base text-sm">J. Doe</span>
</td>
<td className="py-4 px-4 text-right text-secondary">10:42 AM</td>
</tr>
{/*  Row 2  */}
<tr className="border-b border-black/5 hover:bg-white/40 transition-colors group">
<td className="py-4 px-4 text-secondary group-hover:text-primary transition-colors">HD-CORE-GRY-M</td>
<td className="py-4 px-4 font-body-base">Core Logo Hoodie</td>
<td className="py-4 px-4">
<span className="inline-flex items-center px-2 py-1 rounded-full bg-error-container text-on-error-container text-xs font-bold gap-1">
<span className="material-symbols-outlined text-[14px]">arrow_downward</span> 2
                                    </span>
</td>
<td className="py-4 px-4 flex items-center gap-2">
<div className="w-6 h-6 rounded-full bg-surface-variant overflow-hidden shrink-0">
<img className="w-full h-full object-cover" data-alt="A small avatar of a retail staff member, light background" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAsocmiNS60KzBKnqmx0tpQfsr0nNX6N1u_G4-xJMetqAVkY26AZQBCzEqnFqKOM4ZqKmLjcrXEmul_yPg3Y2VyM5x0eEaaWIK196uiy7sSVgXkXI9zYmeBsgPPBLsHY5tzgOoVTJYrWXS8v44AGK1jnQlTenvD8unHzOA-nTvs0Gu5U3kcMDRRuqqMkecHmHLAu_CZu3ck5TQdy6BoYsASpcEAVXRqEphc9nEmWV3woN3nihF881Bc5bdHlX81f2dou-p6fUDRd6eu"/>
</div>
<span className="font-body-base text-sm">S. Smith</span>
</td>
<td className="py-4 px-4 text-right text-secondary">10:15 AM</td>
</tr>
{/*  Row 3 (Limited Drop)  */}
<tr className="hover:bg-white/40 transition-colors group">
<td className="py-4 px-4 text-secondary group-hover:text-primary transition-colors">DRP-V2-WHT-XL</td>
<td className="py-4 px-4 font-body-base flex items-center gap-3">
                                    Archive Tech Cargo
                                    <span className="px-2 py-0.5 bg-on-background text-on-primary font-label-caps text-[10px] rounded-full">LTD</span>
</td>
<td className="py-4 px-4">
<span className="inline-flex items-center px-2 py-1 rounded-full bg-[#f0fdf4] text-[#166534] text-xs font-bold gap-1">
<span className="material-symbols-outlined text-[14px]">arrow_upward</span> 1
                                    </span>
</td>
<td className="py-4 px-4 flex items-center gap-2">
<div className="w-6 h-6 rounded-full bg-surface-variant overflow-hidden shrink-0">
<img className="w-full h-full object-cover" data-alt="A small avatar of a retail staff member, light background" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBg-VsdBjciAJ7ClZspErJwDnN9xT4Zv2_DRqPliaqOanB0654FtchDokR95Ned95gO2shEOii8DI5Q3b77C_d-wlXDce8IKFgbDc614qqkIuYpkJnIVR1qJYzf1wQmAnhprpgMjNXBODzLaCDP70NmK0L0t5ahwqmzkoGH3sf7YA9_VWopSiuspRVWaBaX_uvxeKNusPeLcC3dkADaTYiN5nbv40J6VixfIdRW5y8OP7XvQdcZSwXVRDhc7m23AH2otMXaEzg2ZVhF"/>
</div>
<span className="font-body-base text-sm">J. Doe</span>
</td>
<td className="py-4 px-4 text-right text-secondary">09:58 AM</td>
</tr>
</tbody>
</table>
</div>
</div>
</div>
</main>
<style dangerouslySetInnerHTML={{ __html: `
        @keyframes scan {
            0% { top: 10%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 90%; opacity: 0; }
        }
    ` }} />

    </div>
  );
}
