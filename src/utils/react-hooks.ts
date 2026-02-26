import { type BasicDescription, type Description, type Peer, STATE_READY } from "../psionic";

type PeerContext<T extends BasicDescription> = { peer: Peer<T>, remote: Peer<T>['remote'], ready: boolean };

type FC<P> = (props: P) => any | Promise<any>;
type ReactShape = {
    useSyncExternalStore: any
    createContext: any
    useContext: any
    useEffect: any
    createElement: any
    useRef: any;
};

type ReactPeerProvider<RemoteAPI extends BasicDescription = any> = {
    PeerProvider: FC<{ children: any }>,
    usePeerRemote:() => Description<RemoteAPI>;
    usePeer: () => Peer<RemoteAPI>;
    usePeerReady: () => boolean;
};

export function createPeerHooks<T extends BasicDescription>(peer: Peer<T>, React: ReactShape): ReactPeerProvider<T> {

    const PeerContext = React.createContext(undefined as unknown as PeerContext<any>);

    function PeerProvider({ children }: { children: any }) {
        const remote = React.useSyncExternalStore((d: any) => peer.on('describe', d), () => peer.remote);
        const ready = React.useSyncExternalStore((d: any) => peer.on('readyStateChange', d), () => peer.readyState >= STATE_READY);
        return React.createElement(PeerContext.Provider, { value: { peer, remote, ready } }, children);
    }

    function usePeerRemote() {
        const { remote } = React.useContext(PeerContext);
        return remote as Description<T>;
    }

    function usePeer() {
        const { peer } = React.useContext(PeerContext);
        return peer as Peer<T>;
    }

    function usePeerReady() {
        const { ready } = React.useContext(PeerContext);
        return ready;
    }

    return { PeerProvider, usePeerRemote, usePeer, usePeerReady };
}