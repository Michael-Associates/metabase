import { useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { Stack, Text } from "metabase/ui";
import { getSubpathSafeUrl } from "metabase/urls";
import { assignLazily } from "metabase/utils/merge-lazily";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";

import { useContainerSize } from "../MaShared/use-container-size";

import S from "./MaGraph.module.css";
import { MA_GRAPH_FRAME_PATH, MA_GRAPH_MESSAGES } from "./constants";
import { MA_GRAPH_DEFINITION } from "./definition";
import {
  type GraphContext,
  type GraphData,
  getGraphData,
  getGraphHtml,
  isErrorMessage,
  isReadyMessage,
} from "./graph-data";

function MaGraphComponent({
  rawSeries,
  settings,
  fontFamily,
  isDashboard,
}: VisualizationProps) {
  const [{ data }] = rawSeries;
  const html = getGraphHtml(settings) ?? "";
  const { colorScheme = "light" } = useBrowserRenderingContext({
    fontFamily,
    isDashboard,
  });
  const { ref, width, height } = useContainerSize();
  // A card without results (a virtual card, or one still loading) has
  // nothing for a graph to draw.
  const graphData = useMemo(
    () => (data != null ? getGraphData(data) : null),
    [data],
  );
  const context = useMemo<GraphContext>(
    () => ({ width, height, colorScheme }),
    [width, height, colorScheme],
  );

  return (
    <div ref={ref} className={S.root} data-testid="ma-graph">
      {graphData != null && width > 0 && height > 0 && (
        <GraphFrame
          // A new page starts in a fresh frame: the page writes the graph
          // into itself once, so it can't take a second one.
          key={html}
          html={html}
          data={graphData}
          context={context}
        />
      )}
    </div>
  );
}

type GraphFrameProps = {
  html: string;
  data: GraphData;
  context: GraphContext;
};

type SentState = {
  data: GraphData;
  context: GraphContext;
};

/**
 * The sealed frame a graph runs in. The frame announces itself with a ready
 * message; this answers it once with the graph, its data and a private
 * MessagePort, and sends every later change over that port. The frame's
 * unique origin keeps it away from the user's session and the app.
 */
function GraphFrame({ html, data, context }: GraphFrameProps) {
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [port, setPort] = useState<MessagePort | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useLatest({ html, data, context });
  // What the frame last received, so each change is sent once, and the
  // first render isn't followed by updates the frame already has.
  const sent = useRef<SentState | null>(null);

  useEffect(() => {
    if (frame == null) {
      return;
    }
    let channel: MessageChannel | null = null;
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (
        channel != null ||
        event.source !== frame.contentWindow ||
        !isReadyMessage(event.data)
      ) {
        return;
      }
      channel = new MessageChannel();
      channel.port1.onmessage = (portEvent: MessageEvent<unknown>) => {
        if (isErrorMessage(portEvent.data)) {
          setError(portEvent.data.message);
        }
      };
      const current = latest.current;
      sent.current = { data: current.data, context: current.context };
      // The frame's origin is unique, so "*" is the only target that
      // reaches it; the check on event.source above is what makes sure this
      // answers our own frame.
      frame.contentWindow?.postMessage(
        {
          type: MA_GRAPH_MESSAGES.render,
          html: current.html,
          data: current.data,
          context: current.context,
        },
        "*",
        [channel.port2],
      );
      setPort(channel.port1);
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      channel?.port1.close();
      sent.current = null;
      setPort(null);
    };
  }, [frame, latest]);

  useEffect(() => {
    if (port == null || sent.current == null || sent.current.data === data) {
      return;
    }
    sent.current = { ...sent.current, data };
    setError(null);
    port.postMessage({ type: MA_GRAPH_MESSAGES.update, data });
  }, [port, data]);

  useEffect(() => {
    if (
      port == null ||
      sent.current == null ||
      sent.current.context === context
    ) {
      return;
    }
    sent.current = { ...sent.current, context };
    setError(null);
    port.postMessage({ type: MA_GRAPH_MESSAGES.update, context });
  }, [port, context]);

  return (
    <>
      <iframe
        ref={setFrame}
        className={S.frame}
        src={getSubpathSafeUrl(MA_GRAPH_FRAME_PATH)}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        title={t`Custom graph`}
        // The page's prefers-color-scheme follows the frame's color-scheme.
        style={{ colorScheme: context.colorScheme }}
        data-testid="ma-graph-frame"
      />
      {error != null && (
        <Stack className={S.error} gap={2} data-testid="ma-graph-error">
          <Text fw="bold" fz="sm">{t`The graph's code failed`}</Text>
          <Text c="text-secondary" ff="monospace" fz="xs">
            {error}
          </Text>
        </Stack>
      )}
    </>
  );
}

export const MaGraph = assignLazily(MaGraphComponent, MA_GRAPH_DEFINITION);
