import vueImg from './assets/vue.svg';

export default function App1() {
  return (
    <div style={{ background: 'yellow', padding: 30 }}>
      <img src={vueImg} />
      Vite React App1 [HMR v1] as default export via remote in
      <i>{import.meta.env.DEV ? ' Dev ' : ' prod '}</i> mode
    </div>
  );
}
