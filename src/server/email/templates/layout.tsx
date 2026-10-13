import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type ActionEmailProps = {
  lang: string;
  brandName: string;
  preview: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  note?: string;
  footer: string;
  signature: string;
};

const colors = {
  text: "#18181b",
  muted: "#71717a",
  border: "#e4e4e7",
  primary: "#4f46e5",
  background: "#f4f4f5",
};

/** Shared layout for every transactional email. */
export function ActionEmail(props: ActionEmailProps) {
  return (
    <Html lang={props.lang}>
      <Head />
      <Preview>{props.preview}</Preview>
      <Body
        style={{
          backgroundColor: colors.background,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          margin: 0,
          padding: "32px 12px",
        }}
      >
        <Container
          style={{
            backgroundColor: "#ffffff",
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            maxWidth: 520,
            padding: "32px 32px 24px",
          }}
        >
          <Text
            style={{
              color: colors.primary,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              margin: "0 0 24px",
            }}
          >
            {props.brandName}
          </Text>
          <Heading
            as="h1"
            style={{
              color: colors.text,
              fontSize: 22,
              fontWeight: 600,
              lineHeight: "30px",
              margin: "0 0 16px",
            }}
          >
            {props.heading}
          </Heading>
          {props.paragraphs.map((paragraph) => (
            <Text
              key={paragraph}
              style={{
                color: colors.text,
                fontSize: 15,
                lineHeight: "24px",
                margin: "0 0 16px",
              }}
            >
              {paragraph}
            </Text>
          ))}
          {props.cta ? (
            <Section style={{ margin: "24px 0" }}>
              <Button
                href={props.cta.url}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 8,
                  color: "#ffffff",
                  display: "inline-block",
                  fontSize: 15,
                  fontWeight: 600,
                  padding: "12px 20px",
                  textDecoration: "none",
                }}
              >
                {props.cta.label}
              </Button>
            </Section>
          ) : null}
          {props.note ? (
            <Text
              style={{
                color: colors.muted,
                fontSize: 13,
                lineHeight: "20px",
                margin: "0 0 16px",
              }}
            >
              {props.note}
            </Text>
          ) : null}
          <Text style={{ color: colors.text, fontSize: 15, margin: "8px 0 0" }}>{props.signature}</Text>
          <Hr style={{ borderColor: colors.border, margin: "24px 0 16px" }} />
          <Text
            style={{
              color: colors.muted,
              fontSize: 12,
              lineHeight: "18px",
              margin: 0,
            }}
          >
            {props.footer}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
