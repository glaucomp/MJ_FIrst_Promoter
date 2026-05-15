import { motion } from 'framer-motion';
import { personal } from '../data/portfolio';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.15 } },
};

const item = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: 'easeOut' } },
};

export default function Hero() {
  return (
    <section
      id="about"
      className="relative min-h-screen flex items-center justify-center px-6 pt-24 pb-16"
      style={{ zIndex: 1 }}
    >
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="max-w-4xl mx-auto text-center"
      >
        {/* Avatar placeholder */}
        <motion.div variants={item} className="flex justify-center mb-8">
          <div className="animate-float">
            <div
              className="w-28 h-28 rounded-full animate-pulse-glow flex items-center justify-center text-4xl font-bold"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
              }}
            >
              GP
            </div>
          </div>
        </motion.div>

        <motion.div variants={item}>
          <span className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold tracking-widest uppercase mb-6"
            style={{ background: 'rgba(124,58,237,0.15)', color: '#a78bfa', border: '1px solid rgba(124,58,237,0.3)' }}>
            Available for Senior Roles
          </span>
        </motion.div>

        <motion.h1
          variants={item}
          className="text-5xl md:text-7xl font-black mb-4 leading-tight"
        >
          <span className="text-white">Glauco </span>
          <span className="gradient-text">Pereira</span>
        </motion.h1>

        <motion.p
          variants={item}
          className="text-xl md:text-2xl font-semibold text-slate-300 mb-3"
        >
          {personal.title}
        </motion.p>

        <motion.p
          variants={item}
          className="text-slate-500 text-base md:text-lg mb-8 tracking-wide"
        >
          {personal.subtitle}
        </motion.p>

        <motion.p
          variants={item}
          className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto leading-relaxed mb-10"
        >
          {personal.summary}
        </motion.p>

        <motion.div variants={item} className="flex flex-wrap gap-4 justify-center">
          <a
            href={`mailto:${personal.email}`}
            className="px-8 py-3 rounded-full font-semibold text-white transition-all duration-300 hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)' }}
          >
            Get in Touch
          </a>
          <a
            href={personal.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-3 rounded-full font-semibold text-white transition-all duration-300 hover:scale-105"
            style={{ border: '1px solid rgba(124,58,237,0.5)', background: 'rgba(124,58,237,0.1)' }}
          >
            LinkedIn
          </a>
        </motion.div>

        {/* Stats */}
        <motion.div
          variants={item}
          className="mt-16 grid grid-cols-3 gap-6 max-w-lg mx-auto"
        >
          {[
            { value: '20+', label: 'Years Experience' },
            { value: '3', label: 'Countries' },
            { value: '∞', label: 'Stack Depth' },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <div className="text-3xl font-black gradient-text mb-1">{value}</div>
              <div className="text-xs text-slate-500 uppercase tracking-widest">{label}</div>
            </div>
          ))}
        </motion.div>

        {/* Scroll cue */}
        <motion.div
          variants={item}
          className="mt-16 flex justify-center"
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <div className="w-px h-16 bg-gradient-to-b from-purple-500 to-transparent" />
        </motion.div>
      </motion.div>
    </section>
  );
}
