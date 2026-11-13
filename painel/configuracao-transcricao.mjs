export const MODELOS_TRANSCRICAO = Object.freeze({
  base: { pasta: "whisper-base", nome: "Base · mais preciso, mais processamento" },
  tiny: { pasta: "whisper-tiny", nome: "Tiny · mais leve" },
  small: { pasta: "whisper-small", nome: "Small · fidelidade, maior atraso" },
});
export const modeloValido = (nome) => Object.hasOwn(MODELOS_TRANSCRICAO, nome) ? nome : "base";
