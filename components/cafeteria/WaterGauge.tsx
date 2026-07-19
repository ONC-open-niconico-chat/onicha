import { motion } from "motion/react";

interface WaterGaugeProps {
  name: string;
  nameEn: string;
  percent: number;
  waitMin: number; // current と capacity を削除
}

type Level = "空いている" | "やや混雑" | "混雑" | "非常に混雑";

function getLevel(percent: number): Level {
  if (percent >= 80) return "非常に混雑";
  if (percent >= 60) return "混雑";
  if (percent >= 35) return "やや混雑";
  return "空いている";
}

function getLevelColors(percent: number) {
  if (percent >= 80) return { water: "#ef4444", waterLight: "#fca5a5", badge: "bg-red-100 text-red-700" };
  if (percent >= 60) return { water: "#f97316", waterLight: "#fdba74", badge: "bg-orange-100 text-orange-700" };
  if (percent >= 35) return { water: "#f59e0b", waterLight: "#fcd34d", badge: "bg-amber-100 text-amber-700" };
  return { water: "#22c55e", waterLight: "#86efac", badge: "bg-emerald-100 text-emerald-700" };
}

export function WaterGauge({ name, nameEn, percent, waitMin }: WaterGaugeProps) {
  const level = getLevel(percent);
  const colors = getLevelColors(percent);
  const gaugeHeight = 200;
  const fillHeight = (percent / 100) * gaugeHeight;

  return (
    <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center gap-5 flex-1">
      {/* Title */}
      <div className="text-center">
        <h3 style={{ fontSize: "16px", fontWeight: 600 }}>{name}</h3>
        <p className="text-muted-foreground" style={{ fontSize: "11px", fontFamily: "'DM Mono', monospace", marginTop: "2px" }}>{nameEn}</p>
      </div>

      {/* Gauge */}
      <div className="relative" style={{ width: 120, height: gaugeHeight }}>
        {/* Background tank */}
        <div
          className="absolute inset-0 rounded-2xl border-2 border-border overflow-hidden"
          style={{ background: "#f5f5f0" }}
        >
          {/* Tick marks */}
          {[25, 50, 75].map((tick) => (
            <div
              key={tick}
              className="absolute left-0 right-0 flex items-center"
              style={{ bottom: `${tick}%`, transform: "translateY(50%)" }}
            >
              <div className="w-2 h-px" style={{ background: "rgba(17,17,16,0.15)" }} />
              <div className="flex-1" />
              <span style={{
                fontSize: "9px",
                fontFamily: "'DM Mono', monospace",
                color: "rgba(17,17,16,0.3)",
                paddingRight: "4px",
                lineHeight: 1,
              }}>{tick}</span>
            </div>
          ))}

          {/* Water fill */}
          <motion.div
            className="absolute bottom-0 left-0 right-0 rounded-b-2xl"
            initial={{ height: 0 }}
            animate={{ height: fillHeight }}
            transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1] }}
            style={{ background: colors.water }}
          >
            {/* Wave effect */}
            <svg
              viewBox="0 0 120 20"
              preserveAspectRatio="none"
              className="absolute -top-[18px] left-0 right-0 w-full"
              style={{ height: 20 }}
            >
              <motion.path
                d="M0,10 C20,0 40,20 60,10 C80,0 100,20 120,10 L120,20 L0,20 Z"
                fill={colors.water}
                animate={{ d: [
                  "M0,10 C20,0 40,20 60,10 C80,0 100,20 120,10 L120,20 L0,20 Z",
                  "M0,10 C20,20 40,0 60,10 C80,20 100,0 120,10 L120,20 L0,20 Z",
                  "M0,10 C20,0 40,20 60,10 C80,0 100,20 120,10 L120,20 L0,20 Z",
                ]}}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
            </svg>
            {/* Bubbles */}
            <div className="absolute inset-0 overflow-hidden rounded-b-2xl">
              {percent > 20 && (
                <>
                  <motion.div
                    className="absolute w-1.5 h-1.5 rounded-full"
                    style={{ background: colors.waterLight, left: "25%", bottom: "10%" }}
                    animate={{ y: [-fillHeight, 0], opacity: [0.6, 0] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut", delay: 0 }}
                  />
                  <motion.div
                    className="absolute w-1 h-1 rounded-full"
                    style={{ background: colors.waterLight, left: "60%", bottom: "15%" }}
                    animate={{ y: [-fillHeight * 0.7, 0], opacity: [0.5, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 1.2 }}
                  />
                </>
              )}
            </div>
          </motion.div>

          {/* Percent label inside */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ pointerEvents: "none" }}
          >
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "26px",
                fontWeight: 600,
                color: percent > 50 ? "#fff" : "#111110",
                textShadow: percent > 50 ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
                lineHeight: 1,
              }}
            >
              {percent}%
            </motion.span>
          </div>
        </div>
      </div>

      {/* Info Info (Badge & Wait Time) */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        <span className={`px-3 py-1 rounded-full text-sm ${colors.badge}`} style={{ fontWeight: 500 }}>
          {level}
        </span>
        <p className="text-muted-foreground" style={{ fontSize: "12px" }}>
          予想待ち時間: <span className="font-semibold text-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{waitMin}</span> 分
        </p>
      </div>
    </div>
  );
}